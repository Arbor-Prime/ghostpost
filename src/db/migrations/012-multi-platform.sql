-- Migration 012: Multi-Platform Outreach Engine
-- Sprint 16: Manus-style visible browser + Instagram/LinkedIn

-- Platform accounts (Instagram, LinkedIn, X sessions)
CREATE TABLE IF NOT EXISTS platform_accounts (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    platform VARCHAR(20) NOT NULL CHECK (platform IN ('instagram', 'linkedin', 'x')),
    username VARCHAR(255) NOT NULL,
    display_name VARCHAR(255),
    profile_url TEXT,
    -- Session persistence
    cookies_encrypted TEXT,
    storage_state_path TEXT,
    fingerprint_profile JSONB DEFAULT '{}',
    proxy_config JSONB DEFAULT '{}',
    -- Account health
    status VARCHAR(20) DEFAULT 'warming' CHECK (status IN ('warming', 'active', 'paused', 'restricted', 'banned')),
    warmup_started_at TIMESTAMPTZ,
    warmup_completed_at TIMESTAMPTZ,
    trust_score INTEGER DEFAULT 0, -- 0-100
    -- Daily limits tracking
    daily_actions JSONB DEFAULT '{"dms_sent": 0, "connections_sent": 0, "profiles_viewed": 0, "last_reset": null}',
    -- Meta
    last_active_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, platform, username)
);

-- Outreach campaigns
CREATE TABLE IF NOT EXISTS campaigns (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    name VARCHAR(255) NOT NULL,
    platform VARCHAR(20) NOT NULL CHECK (platform IN ('instagram', 'linkedin', 'x')),
    account_id INTEGER REFERENCES platform_accounts(id),
    -- Targeting
    target_verticals JSONB DEFAULT '[]', -- from Dojo matrix
    target_locations JSONB DEFAULT '[]',
    search_queries JSONB DEFAULT '[]',
    hashtags JSONB DEFAULT '[]',
    -- Message templates (array of variants for rotation)
    message_templates JSONB DEFAULT '[]',
    followup_templates JSONB DEFAULT '[]',
    -- Limits
    daily_limit INTEGER DEFAULT 20,
    hourly_limit INTEGER DEFAULT 5,
    -- Status
    status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'completed')),
    -- Stats
    total_sent INTEGER DEFAULT 0,
    total_replies INTEGER DEFAULT 0,
    total_conversions INTEGER DEFAULT 0,
    -- Scheduling
    active_hours JSONB DEFAULT '{"start": 9, "end": 18}',
    active_days JSONB DEFAULT '[1,2,3,4,5]', -- Mon-Fri
    -- Meta
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Individual leads/targets
CREATE TABLE IF NOT EXISTS leads (
    id SERIAL PRIMARY KEY,
    campaign_id INTEGER REFERENCES campaigns(id),
    platform VARCHAR(20) NOT NULL,
    -- Target info
    username VARCHAR(255) NOT NULL,
    display_name VARCHAR(255),
    profile_url TEXT,
    bio TEXT,
    follower_count INTEGER,
    business_category VARCHAR(255),
    dojo_vertical VARCHAR(255),
    dojo_status VARCHAR(10) CHECK (dojo_status IN ('GREEN', 'AMBER', 'RED')),
    -- Outreach status
    status VARCHAR(30) DEFAULT 'queued' CHECK (status IN (
        'queued', 'profile_viewed', 'dm_sent', 'followup_sent',
        'replied', 'converted', 'not_interested', 'skipped', 'failed'
    )),
    -- Tracking
    profile_viewed_at TIMESTAMPTZ,
    dm_sent_at TIMESTAMPTZ,
    followup_sent_at TIMESTAMPTZ,
    replied_at TIMESTAMPTZ,
    message_used TEXT,
    response_text TEXT,
    -- Meta
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(campaign_id, platform, username)
);

-- Message log (every DM/connection request sent)
CREATE TABLE IF NOT EXISTS outreach_messages (
    id SERIAL PRIMARY KEY,
    lead_id INTEGER REFERENCES leads(id),
    campaign_id INTEGER REFERENCES campaigns(id),
    account_id INTEGER REFERENCES platform_accounts(id),
    platform VARCHAR(20) NOT NULL,
    message_type VARCHAR(20) NOT NULL CHECK (message_type IN ('dm', 'connection_request', 'inmail', 'followup', 'reply')),
    message_text TEXT NOT NULL,
    -- Delivery
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'delivered', 'failed')),
    sent_at TIMESTAMPTZ,
    -- Human simulation metrics
    typing_duration_ms INTEGER,
    scroll_actions INTEGER,
    mouse_movements INTEGER,
    total_session_ms INTEGER,
    -- Error tracking
    error_message TEXT,
    screenshot_path TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Browser sessions (visible browser tracking)
CREATE TABLE IF NOT EXISTS browser_sessions (
    id SERIAL PRIMARY KEY,
    account_id INTEGER REFERENCES platform_accounts(id),
    platform VARCHAR(20) NOT NULL,
    -- Session info
    session_type VARCHAR(30) NOT NULL CHECK (session_type IN (
        'warmup', 'outreach', 'engagement', 'content_browse', 'manual'
    )),
    status VARCHAR(20) DEFAULT 'starting' CHECK (status IN ('starting', 'running', 'paused', 'completed', 'failed')),
    -- VNC/streaming
    vnc_port INTEGER,
    websocket_url TEXT,
    -- Metrics
    actions_performed INTEGER DEFAULT 0,
    pages_visited INTEGER DEFAULT 0,
    dms_sent INTEGER DEFAULT 0,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    ended_at TIMESTAMPTZ,
    duration_ms INTEGER,
    -- Error
    error_message TEXT,
    last_screenshot_path TEXT
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_platform_accounts_user ON platform_accounts(user_id, platform);
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status, platform);
CREATE INDEX IF NOT EXISTS idx_leads_campaign_status ON leads(campaign_id, status);
CREATE INDEX IF NOT EXISTS idx_leads_platform_username ON leads(platform, username);
CREATE INDEX IF NOT EXISTS idx_outreach_messages_lead ON outreach_messages(lead_id);
CREATE INDEX IF NOT EXISTS idx_browser_sessions_account ON browser_sessions(account_id, status);
