-- Migration 013: Conversation Learning Engine
-- Sprint 17: Watch how humans talk to each other across platforms

-- Raw conversation threads observed from public feeds
CREATE TABLE IF NOT EXISTS observed_conversations (
    id SERIAL PRIMARY KEY,
    platform VARCHAR(20) NOT NULL CHECK (platform IN ('x', 'instagram', 'linkedin')),
    -- Thread identity
    thread_id VARCHAR(255) NOT NULL, -- platform-specific thread/post ID
    root_content TEXT NOT NULL,       -- the original post/tweet
    root_author VARCHAR(255),
    root_author_bio TEXT,
    root_author_followers INTEGER,
    root_url TEXT,
    -- Context
    vertical VARCHAR(255),            -- detected business vertical (restaurant, salon, etc.)
    region VARCHAR(255),              -- detected geography if any
    thread_type VARCHAR(30) DEFAULT 'organic' CHECK (thread_type IN (
        'organic', 'cold_outreach', 'warm_reply', 'business_to_customer',
        'customer_to_business', 'peer_to_peer', 'pitch', 'support'
    )),
    -- Metrics
    total_replies INTEGER DEFAULT 0,
    total_participants INTEGER DEFAULT 0,
    engagement_score REAL DEFAULT 0,   -- computed: replies + likes normalised
    conversation_depth INTEGER DEFAULT 0, -- max reply chain depth
    -- Timestamps
    observed_at TIMESTAMPTZ DEFAULT NOW(),
    thread_created_at TIMESTAMPTZ,
    UNIQUE(platform, thread_id)
);

-- Individual messages within a conversation thread
CREATE TABLE IF NOT EXISTS observed_messages (
    id SERIAL PRIMARY KEY,
    conversation_id INTEGER REFERENCES observed_conversations(id) ON DELETE CASCADE,
    platform VARCHAR(20) NOT NULL,
    -- Message data
    message_id VARCHAR(255),          -- platform-specific message/reply ID
    author VARCHAR(255) NOT NULL,
    author_bio TEXT,
    author_followers INTEGER,
    content TEXT NOT NULL,
    -- Position in thread
    reply_depth INTEGER DEFAULT 0,     -- 0 = root, 1 = direct reply, 2 = reply-to-reply
    parent_message_id INTEGER REFERENCES observed_messages(id),
    -- Engagement
    likes INTEGER DEFAULT 0,
    replies INTEGER DEFAULT 0,
    reposts INTEGER DEFAULT 0,
    -- Analysis (filled by pattern extractor)
    tone VARCHAR(30),                  -- casual, professional, warm, salesy, etc.
    intent VARCHAR(30),                -- greeting, pitch, question, compliment, follow_up, etc.
    word_count INTEGER,
    has_question BOOLEAN DEFAULT FALSE,
    has_emoji BOOLEAN DEFAULT FALSE,
    has_link BOOLEAN DEFAULT FALSE,
    opens_conversation BOOLEAN DEFAULT FALSE, -- did this message start a back-and-forth?
    -- Timestamps
    posted_at TIMESTAMPTZ,
    observed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Learned communication patterns extracted by AI
CREATE TABLE IF NOT EXISTS learned_patterns (
    id SERIAL PRIMARY KEY,
    -- What this pattern applies to
    platform VARCHAR(20),              -- null = cross-platform
    vertical VARCHAR(255),             -- null = all verticals
    region VARCHAR(255),               -- null = all regions
    context VARCHAR(50) NOT NULL,      -- 'cold_dm', 'reply', 'follow_up', 'engagement', 'opener', 'closer'
    -- The pattern itself
    pattern_text TEXT NOT NULL,         -- natural language description
    examples JSONB DEFAULT '[]',       -- array of real message examples
    anti_examples JSONB DEFAULT '[]',  -- messages that did NOT work
    -- Metrics
    confidence REAL DEFAULT 0.5,       -- 0-1, increases with more supporting evidence
    evidence_count INTEGER DEFAULT 1,  -- how many conversations support this
    avg_engagement REAL DEFAULT 0,     -- average engagement of messages matching this pattern
    -- Source tracking
    source_conversation_ids JSONB DEFAULT '[]',
    -- Status
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'retired', 'testing')),
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    last_validated_at TIMESTAMPTZ
);

-- Pattern effectiveness scores (tracks how patterns perform when used)
CREATE TABLE IF NOT EXISTS pattern_scores (
    id SERIAL PRIMARY KEY,
    pattern_id INTEGER REFERENCES learned_patterns(id) ON DELETE CASCADE,
    campaign_id INTEGER REFERENCES campaigns(id),
    -- What happened when we used this pattern
    times_used INTEGER DEFAULT 0,
    times_replied INTEGER DEFAULT 0,
    times_converted INTEGER DEFAULT 0,
    times_ignored INTEGER DEFAULT 0,
    reply_rate REAL DEFAULT 0,
    -- Period
    period_start TIMESTAMPTZ DEFAULT NOW(),
    period_end TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Harvesting schedule — tracks what we've already observed
CREATE TABLE IF NOT EXISTS harvest_log (
    id SERIAL PRIMARY KEY,
    platform VARCHAR(20) NOT NULL,
    source_type VARCHAR(30) NOT NULL,  -- 'hashtag', 'profile', 'search', 'feed'
    source_query VARCHAR(255),         -- the hashtag, username, or search term
    -- Results
    threads_found INTEGER DEFAULT 0,
    messages_harvested INTEGER DEFAULT 0,
    patterns_extracted INTEGER DEFAULT 0,
    -- Timing
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    next_harvest_at TIMESTAMPTZ,
    error_message TEXT
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_observed_conv_platform ON observed_conversations(platform, vertical);
CREATE INDEX IF NOT EXISTS idx_observed_conv_engagement ON observed_conversations(engagement_score DESC);
CREATE INDEX IF NOT EXISTS idx_observed_conv_type ON observed_conversations(thread_type, platform);
CREATE INDEX IF NOT EXISTS idx_observed_msg_conv ON observed_messages(conversation_id, reply_depth);
CREATE INDEX IF NOT EXISTS idx_observed_msg_opens ON observed_messages(opens_conversation) WHERE opens_conversation = TRUE;
CREATE INDEX IF NOT EXISTS idx_learned_patterns_lookup ON learned_patterns(platform, vertical, context, status);
CREATE INDEX IF NOT EXISTS idx_learned_patterns_confidence ON learned_patterns(confidence DESC) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_pattern_scores_pattern ON pattern_scores(pattern_id);
CREATE INDEX IF NOT EXISTS idx_harvest_log_next ON harvest_log(platform, next_harvest_at);
