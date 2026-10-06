// Keep SDK logging out of test output (set PSTN2_TEST_LOG=debug to see it).
process.env.PSTN2_LOG_LEVEL = process.env.PSTN2_TEST_LOG || 'silent';
