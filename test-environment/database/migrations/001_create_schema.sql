-- PSTN2 Test Harness Database Schema
-- This script should be run for each CP database: CP1, CP2, CP3

-- Table: numbers
-- Stores phone numbers owned by this CP
CREATE TABLE IF NOT EXISTS numbers (
    id INT PRIMARY KEY AUTO_INCREMENT,
    number VARCHAR(20) UNIQUE NOT NULL,
    number_range VARCHAR(50) NOT NULL,
    status ENUM('active', 'ported_out', 'ported_in', 'reserved') DEFAULT 'active',
    ported_to_cp VARCHAR(50) NULL COMMENT 'CP ID if number is ported out',
    ported_from_cp VARCHAR(50) NULL COMMENT 'Original CP ID if number is ported in',
    subscriber_name VARCHAR(255) NULL COMMENT 'Subscriber display name for branding',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    INDEX idx_number (number),
    INDEX idx_status (status),
    INDEX idx_range (number_range)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: directory_cache
-- Cached directory information from other CPs
CREATE TABLE IF NOT EXISTS directory_cache (
    id INT PRIMARY KEY AUTO_INCREMENT,
    cp_id VARCHAR(50) NOT NULL,
    number_range VARCHAR(50) NOT NULL,
    api_endpoint VARCHAR(255) NOT NULL,
    public_key TEXT,
    cached_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP,

    INDEX idx_cp_id (cp_id),
    INDEX idx_expires (expires_at),
    UNIQUE KEY unique_cp_range (cp_id, number_range)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: auth_tokens
-- Token pool for authentication (if using token pool mode)
CREATE TABLE IF NOT EXISTS auth_tokens (
    id INT PRIMARY KEY AUTO_INCREMENT,
    token_id VARCHAR(64) UNIQUE NOT NULL,
    caller_id VARCHAR(20) NOT NULL,
    called_id VARCHAR(20) NOT NULL,
    call_reference VARCHAR(64) NOT NULL,
    originating_cp VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    used BOOLEAN DEFAULT FALSE,
    used_at TIMESTAMP NULL,
    used_by_cp VARCHAR(50) NULL,

    INDEX idx_token_id (token_id),
    INDEX idx_expires (expires_at),
    INDEX idx_caller (caller_id),
    INDEX idx_call_ref (call_reference)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: call_records
-- Records of all simulated calls
CREATE TABLE IF NOT EXISTS call_records (
    id INT PRIMARY KEY AUTO_INCREMENT,
    call_reference VARCHAR(64) UNIQUE NOT NULL,
    caller_id VARCHAR(20) NOT NULL,
    called_id VARCHAR(20) NOT NULL,
    direction ENUM('inbound', 'outbound') NOT NULL,
    auth_method ENUM('direct_query', 'token_pool', 'none') NULL,
    auth_result ENUM('verified', 'failed', 'timeout', 'pending') DEFAULT 'pending',
    auth_duration_ms INT NULL COMMENT 'Time taken for authentication',
    routing_accepted BOOLEAN DEFAULT FALSE,
    direct_routing_fqdn VARCHAR(255) NULL,
    direct_routing_port INT NULL,
    encryption_key TEXT NULL,
    porting_chain JSON NULL COMMENT 'Array of CP IDs in porting chain',
    call_purpose VARCHAR(255) NULL,
    branding JSON NULL COMMENT 'Call branding information',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP NULL,

    INDEX idx_call_ref (call_reference),
    INDEX idx_caller (caller_id),
    INDEX idx_called (called_id),
    INDEX idx_direction (direction),
    INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: message_log
-- Complete log of all PSTN2 protocol messages
CREATE TABLE IF NOT EXISTS message_log (
    id INT PRIMARY KEY AUTO_INCREMENT,
    message_id VARCHAR(64) UNIQUE NOT NULL,
    call_reference VARCHAR(64) NULL,
    message_type ENUM(
        'auth_request',
        'auth_response',
        'routing_request',
        'routing_response',
        'token_create',
        'token_verify',
        'directory_query',
        'directory_response',
        'porting_query',
        'porting_response'
    ) NOT NULL,
    direction ENUM('sent', 'received') NOT NULL,
    from_cp VARCHAR(50) NOT NULL,
    to_cp VARCHAR(50) NOT NULL,
    request_payload JSON NOT NULL,
    response_payload JSON NULL,
    http_status_code INT NULL,
    error_message TEXT NULL,
    duration_ms INT NULL COMMENT 'Request duration in milliseconds',
    timestamp TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3),

    INDEX idx_call_ref (call_reference),
    INDEX idx_message_type (message_type),
    INDEX idx_timestamp (timestamp),
    INDEX idx_from_cp (from_cp),
    INDEX idx_to_cp (to_cp)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: cp_config
-- Configuration for this CP
CREATE TABLE IF NOT EXISTS cp_config (
    id INT PRIMARY KEY AUTO_INCREMENT,
    cp_id VARCHAR(50) UNIQUE NOT NULL,
    api_endpoint VARCHAR(255) NOT NULL,
    api_port INT NOT NULL DEFAULT 3000,
    public_key TEXT NOT NULL,
    private_key TEXT NOT NULL,
    auth_mode ENUM('direct_query', 'token_pool') DEFAULT 'direct_query',
    token_pool_endpoint VARCHAR(255) NULL,
    enable_direct_routing BOOLEAN DEFAULT TRUE,
    enable_encryption BOOLEAN DEFAULT TRUE,
    enable_branding BOOLEAN DEFAULT TRUE,
    cache_ttl_seconds INT DEFAULT 3600,
    request_timeout_ms INT DEFAULT 2000,
    max_retries INT DEFAULT 3,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: porting_history
-- History of number porting events
CREATE TABLE IF NOT EXISTS porting_history (
    id INT PRIMARY KEY AUTO_INCREMENT,
    number VARCHAR(20) NOT NULL,
    from_cp VARCHAR(50) NOT NULL,
    to_cp VARCHAR(50) NOT NULL,
    ported_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    reason VARCHAR(255) NULL,

    INDEX idx_number (number),
    INDEX idx_ported_at (ported_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: statistics
-- Daily statistics per CP
CREATE TABLE IF NOT EXISTS statistics (
    id INT PRIMARY KEY AUTO_INCREMENT,
    date DATE NOT NULL,
    total_calls INT DEFAULT 0,
    inbound_calls INT DEFAULT 0,
    outbound_calls INT DEFAULT 0,
    auth_successful INT DEFAULT 0,
    auth_failed INT DEFAULT 0,
    auth_timeout INT DEFAULT 0,
    routing_successful INT DEFAULT 0,
    routing_rejected INT DEFAULT 0,
    avg_auth_duration_ms DECIMAL(10,2) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    UNIQUE KEY unique_date (date),
    INDEX idx_date (date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
