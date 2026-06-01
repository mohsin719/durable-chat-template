-- Database Security Initialization Script
-- This script sets up security roles, audit tables, and database-level configuration
-- for the OTP Generator system.

-- ============================================================================
-- EXTENSIONS
-- ============================================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enable cryptographic functions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- DATABASE-LEVEL CONFIGURATION
-- ============================================================================

-- Set maximum connections (Requirement 1.1)
ALTER SYSTEM SET max_connections = 200;

-- Set statement timeout to 30 seconds (Requirement 1.7)
ALTER SYSTEM SET statement_timeout = '30s';

-- Set idle in transaction timeout to 5 minutes (Requirement 1.6)
ALTER SYSTEM SET idle_in_transaction_session_timeout = '5min';

-- Reload configuration to apply changes
SELECT pg_reload_conf();

-- ============================================================================
-- SECURITY ROLES
-- ============================================================================

-- Create vsms_app role with full CRUD permissions (Requirements 1.2, 2.1)
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'vsms_app') THEN
        CREATE ROLE vsms_app WITH LOGIN PASSWORD 'vsms_app_secure_password_change_in_production';
    END IF;
END
$$;

-- Set connection limit for vsms_app (Requirement 1.2)
ALTER ROLE vsms_app CONNECTION LIMIT 50;

-- Create vsms_readonly role with SELECT-only permissions (Requirements 1.3, 2.2)
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'vsms_readonly') THEN
        CREATE ROLE vsms_readonly WITH LOGIN PASSWORD 'vsms_readonly_secure_password_change_in_production';
    END IF;
END
$$;

-- Set connection limit for vsms_readonly (Requirement 1.3)
ALTER ROLE vsms_readonly CONNECTION LIMIT 20;

-- ============================================================================
-- GRANT PERMISSIONS TO ROLES
-- ============================================================================

-- Grant CONNECT privilege to both roles (Requirement 2.3)
GRANT CONNECT ON DATABASE vsms TO vsms_app;
GRANT CONNECT ON DATABASE vsms TO vsms_readonly;

-- Grant USAGE on schema public to both roles (Requirement 2.4)
GRANT USAGE ON SCHEMA public TO vsms_app;
GRANT USAGE ON SCHEMA public TO vsms_readonly;

-- Grant CREATE privilege to vsms_app (Requirement 2.5)
GRANT CREATE ON SCHEMA public TO vsms_app;

-- Grant full CRUD permissions to vsms_app on all existing tables (Requirement 2.1)
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO vsms_app;

-- Grant SELECT-only permissions to vsms_readonly on all existing tables (Requirement 2.2, 2.6)
GRANT SELECT ON ALL TABLES IN SCHEMA public TO vsms_readonly;

-- Grant sequence usage to vsms_app
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO vsms_app;

-- Set default privileges for future tables (Requirement 2.7)
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO vsms_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO vsms_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO vsms_app;

-- ============================================================================
-- AUDIT TABLES
-- ============================================================================

-- Create query_audit_log table (Requirements 9.1, 9.2)
CREATE TABLE IF NOT EXISTS query_audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id TEXT,
    query_type VARCHAR(50),
    table_name VARCHAR(100),
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    duration_ms INTEGER,
    affected_rows INTEGER,
    error_message TEXT
);

-- Create index on user_id for query_audit_log (Requirement 9.7)
CREATE INDEX IF NOT EXISTS idx_query_audit_log_user_id ON query_audit_log(user_id);

-- Create index on timestamp for query_audit_log (Requirement 9.7)
CREATE INDEX IF NOT EXISTS idx_query_audit_log_timestamp ON query_audit_log(timestamp);

-- Create rate_limit_log table (Requirements 9.3, 9.4)
CREATE TABLE IF NOT EXISTS rate_limit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    fingerprint VARCHAR(255),
    endpoint VARCHAR(255),
    request_count INTEGER,
    limit_exceeded BOOLEAN DEFAULT FALSE,
    window_start TIMESTAMP,
    window_end TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index on fingerprint for rate_limit_log (Requirement 9.7)
CREATE INDEX IF NOT EXISTS idx_rate_limit_log_fingerprint ON rate_limit_log(fingerprint);

-- Create blocked_ips table (Requirements 9.5, 9.6)
CREATE TABLE IF NOT EXISTS blocked_ips (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ip_address VARCHAR(45) UNIQUE NOT NULL,
    reason VARCHAR(255),
    blocked_until TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index on ip_address for blocked_ips (Requirement 9.7)
CREATE INDEX IF NOT EXISTS idx_blocked_ips_ip_address ON blocked_ips(ip_address);

-- ============================================================================
-- GRANT PERMISSIONS ON AUDIT TABLES
-- ============================================================================

-- Grant INSERT and SELECT permissions on audit tables to vsms_app (Requirement 9.7)
GRANT INSERT, SELECT ON query_audit_log TO vsms_app;
GRANT INSERT, SELECT ON rate_limit_log TO vsms_app;
GRANT INSERT, SELECT, UPDATE ON blocked_ips TO vsms_app;

-- Grant SELECT-only permissions on audit tables to vsms_readonly
GRANT SELECT ON query_audit_log TO vsms_readonly;
GRANT SELECT ON rate_limit_log TO vsms_readonly;
GRANT SELECT ON blocked_ips TO vsms_readonly;

-- ============================================================================
-- VERIFICATION
-- ============================================================================

-- Verify roles were created
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'vsms_app') THEN
        RAISE EXCEPTION 'vsms_app role was not created successfully';
    END IF;
    
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'vsms_readonly') THEN
        RAISE EXCEPTION 'vsms_readonly role was not created successfully';
    END IF;
    
    RAISE NOTICE 'Database security initialization completed successfully';
END
$$;
