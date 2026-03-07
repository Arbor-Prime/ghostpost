-- Migration 014: LinkedIn Content Engine
-- Sprint 18: Port LinkedIn Autopilot from CC into GhostPost

CREATE TABLE IF NOT EXISTS linkedin_posts (
    id SERIAL PRIMARY KEY,
    user_id INTEGER DEFAULT 1,
    -- Content
    hook TEXT,
    rehook TEXT,
    body TEXT,
    full_post TEXT NOT NULL,
    -- Classification
    post_type VARCHAR(20) DEFAULT 'single' CHECK (post_type IN ('single', 'weekly', 'trend', 'rewrite', 'nurture')),
    pillar VARCHAR(20) CHECK (pillar IN ('growth', 'tam', 'sales')),
    framework VARCHAR(10) CHECK (framework IN ('slay', 'pas')),
    tone VARCHAR(20) DEFAULT 'default',
    topic_angle TEXT,
    -- Weekly calendar
    week_of DATE,
    day_of_week VARCHAR(10),
    day_index INTEGER,
    -- AI metadata
    hook_score INTEGER,
    estimated_impressions VARCHAR(10),
    reasoning TEXT,
    -- Status workflow
    status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'scheduled', 'posted', 'rejected')),
    scheduled_for TIMESTAMPTZ,
    posted_at TIMESTAMPTZ,
    -- Performance tracking
    impressions INTEGER DEFAULT 0,
    likes INTEGER DEFAULT 0,
    comments INTEGER DEFAULT 0,
    leads_generated INTEGER DEFAULT 0,
    -- Source
    trend_topic TEXT,
    news_url TEXT,
    regeneration_count INTEGER DEFAULT 0,
    notes TEXT,
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_linkedin_posts_status ON linkedin_posts(status);
CREATE INDEX IF NOT EXISTS idx_linkedin_posts_week ON linkedin_posts(week_of, day_index);
CREATE INDEX IF NOT EXISTS idx_linkedin_posts_pillar ON linkedin_posts(pillar);
