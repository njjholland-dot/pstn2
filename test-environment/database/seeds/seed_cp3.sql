-- Seed data for CP3 database
USE CP3;

-- CP Configuration (CP3 uses token pool)
INSERT INTO cp_config (cp_id, api_endpoint, api_port, public_key, private_key, auth_mode, token_pool_endpoint) VALUES
('CP3-UK-0003', 'http://localhost:3003', 3003,
 '-----BEGIN PUBLIC KEY-----\nCP3_PUBLIC_KEY_PLACEHOLDER\n-----END PUBLIC KEY-----',
 '-----BEGIN PRIVATE KEY-----\nCP3_PRIVATE_KEY_PLACEHOLDER\n-----END PRIVATE KEY-----',
 'token_pool',
 'http://localhost:3000/token-pool');

-- Number Ranges for CP3
-- Range: +44777700XX (100 numbers)
INSERT INTO numbers (number, number_range, status, subscriber_name) VALUES
('+447777700000', '+44777700XX', 'active', 'ACME Corporation'),
('+447777700001', '+44777700XX', 'active', 'Stark Industries'),
('+447777700002', '+44777700XX', 'active', 'Wayne Enterprises'),
('+447777700003', '+44777700XX', 'active', 'Oscorp Industries'),
('+447777700004', '+44777700XX', 'active', 'Umbrella Corporation'),
('+447777700005', '+44777700XX', 'active', 'Cyberdyne Systems'),
('+447777700006', '+44777700XX', 'active', 'Weyland-Yutani'),
('+447777700007', '+44777700XX', 'active', 'Massive Dynamic'),
('+447777700008', '+44777700XX', 'active', 'InGen'),
('+447777700009', '+44777700XX', 'active', 'Tyrell Corporation');

-- Add more numbers (10-99) as active
INSERT INTO numbers (number, number_range, status)
SELECT CONCAT('+447777700', LPAD(n, 3, '0')), '+44777700XX', 'active'
FROM (
    SELECT 10 + a.n + b.n * 10 AS n
    FROM
        (SELECT 0 AS n UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4
         UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9) a,
        (SELECT 0 AS n UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4
         UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8) b
    WHERE 10 + a.n + b.n * 10 < 100
) numbers;

-- Range: +44777701XX (100 numbers)
INSERT INTO numbers (number, number_range, status)
SELECT CONCAT('+447777701', LPAD(n, 3, '0')), '+44777701XX', 'active'
FROM (
    SELECT a.n + b.n * 10 AS n
    FROM
        (SELECT 0 AS n UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4
         UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9) a,
        (SELECT 0 AS n UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4
         UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9) b
    WHERE a.n + b.n * 10 < 100
) numbers;

-- Directory cache - CP1 and CP2 endpoints
INSERT INTO directory_cache (cp_id, number_range, api_endpoint, expires_at) VALUES
('CP1-UK-0001', '+44712345XX', 'http://localhost:3001', DATE_ADD(NOW(), INTERVAL 1 HOUR)),
('CP1-UK-0001', '+44712346XX', 'http://localhost:3001', DATE_ADD(NOW(), INTERVAL 1 HOUR)),
('CP2-UK-0002', '+44770090XX', 'http://localhost:3002', DATE_ADD(NOW(), INTERVAL 1 HOUR)),
('CP2-UK-0002', '+44770091XX', 'http://localhost:3002', DATE_ADD(NOW(), INTERVAL 1 HOUR));

-- Initialize today's statistics
INSERT INTO statistics (date, total_calls, inbound_calls, outbound_calls) VALUES
(CURDATE(), 0, 0, 0);
