-- Seed data for CP1 database
USE CP1;

-- CP Configuration
INSERT INTO cp_config (cp_id, api_endpoint, api_port, public_key, private_key, auth_mode) VALUES
('CP1-UK-0001', 'http://localhost:3001', 3001,
 '-----BEGIN PUBLIC KEY-----\nCP1_PUBLIC_KEY_PLACEHOLDER\n-----END PUBLIC KEY-----',
 '-----BEGIN PRIVATE KEY-----\nCP1_PRIVATE_KEY_PLACEHOLDER\n-----END PRIVATE KEY-----',
 'direct_query');

-- Number Ranges for CP1
-- Range: +44712345XX (100 numbers)
INSERT INTO numbers (number, number_range, status, subscriber_name) VALUES
('+441712345000', '+44712345XX', 'active', 'Alice Johnson'),
('+441712345001', '+44712345XX', 'active', 'Bob Smith'),
('+441712345002', '+44712345XX', 'active', 'Charlie Brown'),
('+441712345003', '+44712345XX', 'active', 'David Wilson'),
('+441712345004', '+44712345XX', 'active', 'Emma Davis'),
('+441712345005', '+44712345XX', 'active', 'Frank Miller'),
('+441712345006', '+44712345XX', 'active', 'Grace Lee'),
('+441712345007', '+44712345XX', 'active', 'Henry Taylor'),
('+441712345008', '+44712345XX', 'active', 'Ivy Anderson'),
('+441712345009', '+44712345XX', 'active', 'Jack Thomas');

-- Add more numbers (10-99) as active
INSERT INTO numbers (number, number_range, status)
SELECT CONCAT('+44171234', LPAD(n, 4, '0')), '+44712345XX', 'active'
FROM (
    SELECT 10 + a.n + b.n * 10 AS n
    FROM
        (SELECT 0 AS n UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4
         UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9) a,
        (SELECT 0 AS n UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4
         UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8) b
    WHERE 10 + a.n + b.n * 10 < 100
) numbers;

-- Range: +44712346XX (100 numbers)
INSERT INTO numbers (number, number_range, status)
SELECT CONCAT('+44171234', LPAD(n, 4, '0')), '+44712346XX', 'active'
FROM (
    SELECT a.n + b.n * 10 AS n
    FROM
        (SELECT 0 AS n UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4
         UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9) a,
        (SELECT 0 AS n UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4
         UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9) b
    WHERE a.n + b.n * 10 < 100
) numbers;

-- Directory cache - CP2 and CP3 endpoints
INSERT INTO directory_cache (cp_id, number_range, api_endpoint, expires_at) VALUES
('CP2-UK-0002', '+44770090XX', 'http://localhost:3002', DATE_ADD(NOW(), INTERVAL 1 HOUR)),
('CP2-UK-0002', '+44770091XX', 'http://localhost:3002', DATE_ADD(NOW(), INTERVAL 1 HOUR)),
('CP3-UK-0003', '+44777700XX', 'http://localhost:3003', DATE_ADD(NOW(), INTERVAL 1 HOUR)),
('CP3-UK-0003', '+44777701XX', 'http://localhost:3003', DATE_ADD(NOW(), INTERVAL 1 HOUR));

-- Initialize today's statistics
INSERT INTO statistics (date, total_calls, inbound_calls, outbound_calls) VALUES
(CURDATE(), 0, 0, 0);
