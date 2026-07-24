-- Seed data for CP2 database
USE CP2;

-- CP Configuration
INSERT INTO cp_config (cp_id, api_endpoint, api_port, public_key, private_key, auth_mode) VALUES
('CP2-UK-0002', 'http://localhost:3002', 3002,
 '-----BEGIN PUBLIC KEY-----\nCP2_PUBLIC_KEY_PLACEHOLDER\n-----END PUBLIC KEY-----',
 '-----BEGIN PRIVATE KEY-----\nCP2_PRIVATE_KEY_PLACEHOLDER\n-----END PRIVATE KEY-----',
 'direct_query');

-- Number Ranges for CP2
-- Range: +44770090XX (100 numbers)
INSERT INTO numbers (number, number_range, status, subscriber_name) VALUES
('+447770900000', '+44770090XX', 'active', 'Sarah Connor'),
('+447770900001', '+44770090XX', 'active', 'John McClane'),
('+447770900002', '+44770090XX', 'active', 'Ellen Ripley'),
('+447770900003', '+44770090XX', 'active', 'Martin Riggs'),
('+447770900004', '+44770090XX', 'active', 'Clarice Starling'),
('+447770900005', '+44770090XX', 'active', 'James Bond'),
('+447770900006', '+44770090XX', 'active', 'Lara Croft'),
('+447770900007', '+44770090XX', 'active', 'Indiana Jones'),
('+447770900008', '+44770090XX', 'active', 'Ethan Hunt'),
('+447770900009', '+44770090XX', 'active', 'Jason Bourne');

-- Add more numbers (10-99) as active
INSERT INTO numbers (number, number_range, status)
SELECT CONCAT('+447770900', LPAD(n, 3, '0')), '+44770090XX', 'active'
FROM (
    SELECT 10 + a.n + b.n * 10 AS n
    FROM
        (SELECT 0 AS n UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4
         UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9) a,
        (SELECT 0 AS n UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4
         UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8) b
    WHERE 10 + a.n + b.n * 10 < 100
) numbers;

-- Range: +44770091XX (100 numbers)
INSERT INTO numbers (number, number_range, status)
SELECT CONCAT('+447770901', LPAD(n, 3, '0')), '+44770091XX', 'active'
FROM (
    SELECT a.n + b.n * 10 AS n
    FROM
        (SELECT 0 AS n UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4
         UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9) a,
        (SELECT 0 AS n UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4
         UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9) b
    WHERE a.n + b.n * 10 < 100
) numbers;

-- Directory cache - CP1 and CP3 endpoints
INSERT INTO directory_cache (cp_id, number_range, api_endpoint, expires_at) VALUES
('CP1-UK-0001', '+44712345XX', 'http://localhost:3001', DATE_ADD(NOW(), INTERVAL 1 HOUR)),
('CP1-UK-0001', '+44712346XX', 'http://localhost:3001', DATE_ADD(NOW(), INTERVAL 1 HOUR)),
('CP3-UK-0003', '+44777700XX', 'http://localhost:3003', DATE_ADD(NOW(), INTERVAL 1 HOUR)),
('CP3-UK-0003', '+44777701XX', 'http://localhost:3003', DATE_ADD(NOW(), INTERVAL 1 HOUR));

-- Initialize today's statistics
INSERT INTO statistics (date, total_calls, inbound_calls, outbound_calls) VALUES
(CURDATE(), 0, 0, 0);
