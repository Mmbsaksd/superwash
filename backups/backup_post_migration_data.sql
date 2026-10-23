SET session_replication_role = replica;

--
-- PostgreSQL database dump
--

-- \restrict g8geTEyA1V6zDkwzHuQ6mN2kkwSFPPBbAI6VT2UhF1pVm4yvg1sQnOtjCejOfqZ

-- Dumped from database version 17.11
-- Dumped by pg_dump version 17.11

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Data for Name: audit_log_entries; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: custom_oauth_providers; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: flow_state; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

INSERT INTO "auth"."flow_state" ("id", "user_id", "auth_code", "code_challenge_method", "code_challenge", "provider_type", "provider_access_token", "provider_refresh_token", "created_at", "updated_at", "authentication_method", "auth_code_issued_at", "invite_token", "referrer", "oauth_client_state_id", "linking_target_id", "email_optional") VALUES
	('c84ac94f-d23f-49d2-bf5b-4c74da2ed178', NULL, NULL, NULL, NULL, 'google', '', '', '2026-10-22 10:51:14.314901+00', '2026-10-22 10:51:14.314901+00', 'oauth', NULL, NULL, 'http://localhost:5173/customer', NULL, NULL, false),
	('ca04fd08-74e1-43c7-9afb-207f25d8b420', NULL, NULL, NULL, NULL, 'google', '', '', '2026-10-22 11:01:09.096695+00', '2026-10-22 11:01:09.096695+00', 'oauth', NULL, NULL, 'http://localhost:5173/customer', NULL, NULL, false),
	('9c548d09-5daf-49ea-8f14-d20b56ad1629', NULL, NULL, NULL, NULL, 'google', '', '', '2026-10-22 17:12:20.479094+00', '2026-10-22 17:12:20.479094+00', 'oauth', NULL, NULL, 'http://localhost:5173/customer', NULL, NULL, false),
	('97c79bfb-216d-441a-9dd4-d385c5932961', NULL, NULL, NULL, NULL, 'google', '', '', '2026-10-23 02:10:52.294315+00', '2026-10-23 02:10:52.294315+00', 'oauth', NULL, NULL, 'http://localhost:5173/customer', NULL, NULL, false);


--
-- Data for Name: users; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

INSERT INTO "auth"."users" ("instance_id", "id", "aud", "role", "email", "encrypted_password", "email_confirmed_at", "invited_at", "confirmation_token", "confirmation_sent_at", "recovery_token", "recovery_sent_at", "email_change_token_new", "email_change", "email_change_sent_at", "last_sign_in_at", "raw_app_meta_data", "raw_user_meta_data", "is_super_admin", "created_at", "updated_at", "phone", "phone_confirmed_at", "phone_change", "phone_change_token", "phone_change_sent_at", "email_change_token_current", "email_change_confirm_status", "banned_until", "reauthentication_token", "reauthentication_sent_at", "is_sso_user", "deleted_at", "is_anonymous") VALUES
	('00000000-0000-0000-0000-000000000000', 'c32bbcef-818d-4ee9-b92c-315d687d9bd0', 'authenticated', 'authenticated', 'suresh.superwash.express@gmail.com', '$2a$10$iVuGyBtybPOAmJNOArP6/ejLJpV7QbkizHM94J.Ti7dUYlGIlvbpK', '2026-10-23 02:14:15.819272+00', NULL, '67f23ca3010e19b583ebee14c6aad63622e86b301f740c4b627ef324', '2026-10-22 15:10:52.933449+00', '', NULL, '', '', NULL, NULL, '{"provider": "email", "providers": ["email"]}', '{"sub": "c32bbcef-818d-4ee9-b92c-315d687d9bd0", "name": "Suresh Kumar", "email": "suresh.superwash.express@gmail.com", "full_name": "Suresh Kumar", "email_verified": false, "phone_verified": false}', NULL, '2026-10-22 15:10:52.904092+00', '2026-10-22 15:10:54.30107+00', NULL, NULL, '', '', NULL, '', 0, NULL, '', NULL, false, NULL, false),
	('00000000-0000-0000-0000-000000000000', '06fcba51-f920-4278-95d5-b0bc3660c213', 'authenticated', 'authenticated', 'genaidream@gmail.com', NULL, '2026-10-22 09:47:09.877995+00', NULL, '', NULL, '', NULL, '', '', NULL, '2026-10-22 15:45:10.083502+00', '{"provider": "google", "providers": ["google"]}', '{"iss": "https://accounts.google.com", "sub": "114739659903671938408", "name": "Gen AI", "email": "genaidream@gmail.com", "picture": "https://lh3.googleusercontent.com/a/ACg8ocL8D1ff8a_V8SF9AMChTiPXxjYbkVRQBkrhgLIxtCXwIzoY-A=s96-c", "full_name": "Gen AI", "avatar_url": "https://lh3.googleusercontent.com/a/ACg8ocL8D1ff8a_V8SF9AMChTiPXxjYbkVRQBkrhgLIxtCXwIzoY-A=s96-c", "provider_id": "114739659903671938408", "email_verified": true, "phone_verified": false}', NULL, '2026-10-22 09:47:09.855955+00', '2026-10-23 00:42:05.647956+00', NULL, NULL, '', '', NULL, '', 0, NULL, '', NULL, false, NULL, false),
	('00000000-0000-0000-0000-000000000000', 'eeb4d846-f42d-4b2e-bcff-b495f4255fa7', 'authenticated', 'authenticated', 'superwash.audit.1792664886550@gmail.com', '$2a$10$NQtC3rfBWR1OnG0ZcElzyOd3RpJ1Dok2D.hL/yB9OEXYztEaPh4nO', '2026-10-22 12:19:54.277465+00', NULL, 'a12381a4a146704cecad6e68f427b2350aed35e47348e7c444ed7347', '2026-10-22 10:28:06.71081+00', '', NULL, '', '', NULL, '2026-10-22 18:01:45.229914+00', '{"provider": "email", "providers": ["email"]}', '{"sub": "eeb4d846-f42d-4b2e-bcff-b495f4255fa7", "email": "superwash.audit.1792664886550@gmail.com", "email_verified": false, "phone_verified": false}', NULL, '2026-10-22 10:28:06.705177+00', '2026-10-23 01:41:14.350065+00', NULL, NULL, '', '', NULL, '', 0, NULL, '', NULL, false, NULL, false),
	('00000000-0000-0000-0000-000000000000', '7010c68d-2da3-4ef5-ba16-99c22d00e77a', 'authenticated', 'authenticated', 'manager@superwash.in', '$2a$10$NQtC3rfBWR1OnG0ZcElzyOd3RpJ1Dok2D.hL/yB9OEXYztEaPh4nO', '2026-10-22 12:12:31.280999+00', NULL, '675f7fb85ec3e2c7558c99043461f1cb4f4964e910ddd9216f896bc5', '2026-10-22 12:12:03.014966+00', '', NULL, '', '', NULL, '2026-10-23 01:55:31.204956+00', '{"provider": "email", "providers": ["email"]}', '{"sub": "7010c68d-2da3-4ef5-ba16-99c22d00e77a", "email": "manager.test.1792671122758@superwash.in", "full_name": "Store Manager Ananya", "email_verified": false, "phone_verified": false}', NULL, '2026-10-22 12:12:02.97179+00', '2026-10-23 01:55:31.224876+00', NULL, NULL, '', '', NULL, '', 0, NULL, '', NULL, false, NULL, false),
	('00000000-0000-0000-0000-000000000000', 'b80c9cb9-0e8c-4b5b-9b99-ce28e8f9dc3b', 'authenticated', 'authenticated', 'customer.test.1792675990753@gmail.com', '$2a$10$R939mDRtsmNgppdVM4SdqeoQWRH2JtkKjE.pVYhrJm9KWAHTa0KA2', NULL, NULL, '86bd2f324c08ca5aa8acb38bda085e9ac0cbc2d81c0d170d3020966f', '2026-10-22 13:33:11.290158+00', '', NULL, '', '', NULL, NULL, '{"provider": "email", "providers": ["email"]}', '{"sub": "b80c9cb9-0e8c-4b5b-9b99-ce28e8f9dc3b", "email": "customer.test.1792675990753@gmail.com", "email_verified": false, "phone_verified": false}', NULL, '2026-10-22 13:33:11.090245+00', '2026-10-22 13:33:12.360722+00', NULL, NULL, '', '', NULL, '', 0, NULL, '', NULL, false, NULL, false),
	('00000000-0000-0000-0000-000000000000', '2f49d987-b97d-43ac-bcbd-b9b73d281c69', 'authenticated', 'authenticated', 'delivery.associate2@gmail.com', '$2a$10$5zBUAsVT/36k/f12NFSec.RV/r2kLbmGpKl1mM8vtydDNfHB1P.Ny', NULL, NULL, '48734d10dcfb83c8a5313bb9bc08bc25394e632d9be7628b64eb221b', '2026-10-22 16:17:38.226107+00', '', NULL, '', '', NULL, NULL, '{"provider": "email", "providers": ["email"]}', '{"sub": "2f49d987-b97d-43ac-bcbd-b9b73d281c69", "role": "delivery", "email": "delivery.associate2@gmail.com", "phone": "9876543216", "full_name": "Suresh Kumar (Associate 2)", "email_verified": false, "phone_verified": false}', NULL, '2026-10-22 16:17:38.194942+00', '2026-10-22 16:17:39.559394+00', NULL, NULL, '', '', NULL, '', 0, NULL, '', NULL, false, NULL, false);


--
-- Data for Name: identities; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

INSERT INTO "auth"."identities" ("provider_id", "user_id", "identity_data", "provider", "last_sign_in_at", "created_at", "updated_at", "id") VALUES
	('2f49d987-b97d-43ac-bcbd-b9b73d281c69', '2f49d987-b97d-43ac-bcbd-b9b73d281c69', '{"sub": "2f49d987-b97d-43ac-bcbd-b9b73d281c69", "role": "delivery", "email": "delivery.associate2@gmail.com", "phone": "9876543216", "full_name": "Suresh Kumar (Associate 2)", "email_verified": false, "phone_verified": false}', 'email', '2026-10-22 16:17:38.221703+00', '2026-10-22 16:17:38.221752+00', '2026-10-22 16:17:38.221752+00', 'fa48b5e6-cdb7-4027-ab80-fb411a7af4ae'),
	('eeb4d846-f42d-4b2e-bcff-b495f4255fa7', 'eeb4d846-f42d-4b2e-bcff-b495f4255fa7', '{"sub": "eeb4d846-f42d-4b2e-bcff-b495f4255fa7", "email": "superwash.audit.1792664886550@gmail.com", "email_verified": false, "phone_verified": false}', 'email', '2026-10-22 10:28:06.707992+00', '2026-10-22 10:28:06.708063+00', '2026-10-22 10:28:06.708063+00', 'c5b07efc-ef3d-465a-aa50-546073a816a0'),
	('7010c68d-2da3-4ef5-ba16-99c22d00e77a', '7010c68d-2da3-4ef5-ba16-99c22d00e77a', '{"sub": "7010c68d-2da3-4ef5-ba16-99c22d00e77a", "email": "manager@superwash.in", "full_name": "Store Manager Ananya", "email_verified": false, "phone_verified": false}', 'email', '2026-10-22 12:12:03.009108+00', '2026-10-22 12:12:03.009167+00', '2026-10-22 12:12:03.009167+00', '9642eefd-fed1-478c-b6ba-e61cd52165f0'),
	('b80c9cb9-0e8c-4b5b-9b99-ce28e8f9dc3b', 'b80c9cb9-0e8c-4b5b-9b99-ce28e8f9dc3b', '{"sub": "b80c9cb9-0e8c-4b5b-9b99-ce28e8f9dc3b", "email": "customer.test.1792675990753@gmail.com", "email_verified": false, "phone_verified": false}', 'email', '2026-10-22 13:33:11.27679+00', '2026-10-22 13:33:11.276845+00', '2026-10-22 13:33:11.276845+00', '6b85f14c-1683-4747-9dfa-17a054555311'),
	('c32bbcef-818d-4ee9-b92c-315d687d9bd0', 'c32bbcef-818d-4ee9-b92c-315d687d9bd0', '{"sub": "c32bbcef-818d-4ee9-b92c-315d687d9bd0", "name": "Suresh Kumar", "email": "suresh.superwash.express@gmail.com", "full_name": "Suresh Kumar", "email_verified": false, "phone_verified": false}', 'email', '2026-10-22 15:10:52.928842+00', '2026-10-22 15:10:52.928892+00', '2026-10-22 15:10:52.928892+00', 'cca78d1c-de0e-4091-85d2-535e69a9c17c'),
	('114739659903671938408', '06fcba51-f920-4278-95d5-b0bc3660c213', '{"iss": "https://accounts.google.com", "sub": "114739659903671938408", "name": "Gen AI", "email": "genaidream@gmail.com", "picture": "https://lh3.googleusercontent.com/a/ACg8ocL8D1ff8a_V8SF9AMChTiPXxjYbkVRQBkrhgLIxtCXwIzoY-A=s96-c", "full_name": "Gen AI", "avatar_url": "https://lh3.googleusercontent.com/a/ACg8ocL8D1ff8a_V8SF9AMChTiPXxjYbkVRQBkrhgLIxtCXwIzoY-A=s96-c", "provider_id": "114739659903671938408", "email_verified": true, "phone_verified": false}', 'google', '2026-10-22 09:47:09.872367+00', '2026-10-22 09:47:09.872424+00', '2026-10-22 15:45:10.078998+00', '0d18d86e-b6f9-4c0a-a643-2bcad801413d');


--
-- Data for Name: instances; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: oauth_clients; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: sessions; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

INSERT INTO "auth"."sessions" ("id", "user_id", "created_at", "updated_at", "factor_id", "aal", "not_after", "refreshed_at", "user_agent", "ip", "tag", "oauth_client_id", "refresh_token_hmac_key", "refresh_token_counter", "scopes") VALUES
	('a64414a3-a541-446a-bb53-91ba70c6a8d3', 'eeb4d846-f42d-4b2e-bcff-b495f4255fa7', '2026-10-22 15:47:51.560007+00', '2026-10-22 15:47:51.560007+00', NULL, 'aal1', NULL, NULL, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36 Edg/155.0.0.0', '106.51.203.35', NULL, NULL, NULL, NULL, NULL),
	('c032dcc2-2c24-4629-bec9-f4558bc2912c', 'eeb4d846-f42d-4b2e-bcff-b495f4255fa7', '2026-10-22 15:52:46.952138+00', '2026-10-22 15:52:46.952138+00', NULL, 'aal1', NULL, NULL, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36 Edg/155.0.0.0', '106.51.203.35', NULL, NULL, NULL, NULL, NULL),
	('26c0c192-196b-4889-8fe0-c2fbec1b26ba', 'eeb4d846-f42d-4b2e-bcff-b495f4255fa7', '2026-10-22 16:03:56.248689+00', '2026-10-22 16:03:56.248689+00', NULL, 'aal1', NULL, NULL, 'node', '106.51.203.35', NULL, NULL, NULL, NULL, NULL),
	('0f6cf926-bc01-4ce6-b649-49f8f432e2b9', 'eeb4d846-f42d-4b2e-bcff-b495f4255fa7', '2026-10-22 16:49:48.689759+00', '2026-10-22 16:49:48.689759+00', NULL, 'aal1', NULL, NULL, 'node', '106.51.203.35', NULL, NULL, NULL, NULL, NULL),
	('9ac3c786-a283-4ffb-9ee9-89b50d80d429', 'eeb4d846-f42d-4b2e-bcff-b495f4255fa7', '2026-10-22 18:01:45.229998+00', '2026-10-22 18:01:45.229998+00', NULL, 'aal1', NULL, NULL, 'node', '106.51.203.35', NULL, NULL, NULL, NULL, NULL),
	('b311eccd-4299-4e84-b192-4e45a063527d', 'eeb4d846-f42d-4b2e-bcff-b495f4255fa7', '2026-10-22 17:44:54.875016+00', '2026-10-23 01:41:14.364972+00', NULL, 'aal1', NULL, '2026-10-23 01:41:14.364853', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36', '106.51.202.29', NULL, NULL, NULL, NULL, NULL),
	('f5fbb7c9-f817-45e7-9a65-a22a4de3cdeb', 'eeb4d846-f42d-4b2e-bcff-b495f4255fa7', '2026-10-22 15:45:30.230424+00', '2026-10-22 15:45:30.230424+00', NULL, 'aal1', NULL, NULL, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36 Edg/155.0.0.0', '106.51.203.35', NULL, NULL, NULL, NULL, NULL),
	('34132b0b-b013-4f42-9870-77b2512287a7', 'eeb4d846-f42d-4b2e-bcff-b495f4255fa7', '2026-10-22 15:45:43.199435+00', '2026-10-22 15:45:43.199435+00', NULL, 'aal1', NULL, NULL, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36 Edg/155.0.0.0', '106.51.203.35', NULL, NULL, NULL, NULL, NULL);


--
-- Data for Name: mfa_amr_claims; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

INSERT INTO "auth"."mfa_amr_claims" ("session_id", "created_at", "updated_at", "authentication_method", "id") VALUES
	('a64414a3-a541-446a-bb53-91ba70c6a8d3', '2026-10-22 15:47:51.57838+00', '2026-10-22 15:47:51.57838+00', 'password', 'e6897a5a-2b88-44de-9860-ceb0c52e9ca7'),
	('c032dcc2-2c24-4629-bec9-f4558bc2912c', '2026-10-22 15:52:46.955387+00', '2026-10-22 15:52:46.955387+00', 'password', '7040679e-fab6-4a14-a6a5-0acc5cecde28'),
	('26c0c192-196b-4889-8fe0-c2fbec1b26ba', '2026-10-22 16:03:56.307127+00', '2026-10-22 16:03:56.307127+00', 'password', '43c1dc09-cd1f-4496-80dc-1c9cecf50c95'),
	('0f6cf926-bc01-4ce6-b649-49f8f432e2b9', '2026-10-22 16:49:48.713017+00', '2026-10-22 16:49:48.713017+00', 'password', '746c8609-61bf-4bb5-a87b-e643aa41b51f'),
	('b311eccd-4299-4e84-b192-4e45a063527d', '2026-10-22 17:44:54.915554+00', '2026-10-22 17:44:54.915554+00', 'password', '8f668541-82d8-44f3-923f-cb04416c8575'),
	('9ac3c786-a283-4ffb-9ee9-89b50d80d429', '2026-10-22 18:01:45.236228+00', '2026-10-22 18:01:45.236228+00', 'password', '6608d63e-65db-47b6-8043-9019fed60111'),
	('f5fbb7c9-f817-45e7-9a65-a22a4de3cdeb', '2026-10-22 15:45:30.238798+00', '2026-10-22 15:45:30.238798+00', 'password', 'b54fa963-b8d6-4b16-9768-b9cd0411cfa4'),
	('34132b0b-b013-4f42-9870-77b2512287a7', '2026-10-22 15:45:43.214868+00', '2026-10-22 15:45:43.214868+00', 'password', '11440ae6-8f4a-47f5-b806-10f01f43021a');


--
-- Data for Name: mfa_factors; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: mfa_challenges; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: mfa_recovery_code_sets; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: mfa_recovery_codes; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: oauth_authorizations; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: oauth_client_states; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: oauth_consents; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: one_time_tokens; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

INSERT INTO "auth"."one_time_tokens" ("id", "user_id", "token_type", "token_hash", "relates_to", "created_at", "updated_at", "expires_at") VALUES
	('5923da8e-2f0b-4f63-ab77-1654de5b5143', 'eeb4d846-f42d-4b2e-bcff-b495f4255fa7', 'confirmation_token', 'a12381a4a146704cecad6e68f427b2350aed35e47348e7c444ed7347', 'superwash.audit.1792664886550@gmail.com', '2026-10-22 10:28:07.919238', '2026-10-22 10:28:07.919238', NULL),
	('b066aefd-adde-478c-9ee1-ed0a8023d8ca', '7010c68d-2da3-4ef5-ba16-99c22d00e77a', 'confirmation_token', '675f7fb85ec3e2c7558c99043461f1cb4f4964e910ddd9216f896bc5', 'manager.test.1792671122758@superwash.in', '2026-10-22 12:12:04.467629', '2026-10-22 12:12:04.467629', NULL),
	('8cc03271-68ea-4bc7-adc6-263fe4807d10', 'b80c9cb9-0e8c-4b5b-9b99-ce28e8f9dc3b', 'confirmation_token', '86bd2f324c08ca5aa8acb38bda085e9ac0cbc2d81c0d170d3020966f', 'customer.test.1792675990753@gmail.com', '2026-10-22 13:33:12.406916', '2026-10-22 13:33:12.406916', NULL),
	('7b98f416-b2fb-4a27-aa13-bf9c2d0fcba4', 'c32bbcef-818d-4ee9-b92c-315d687d9bd0', 'confirmation_token', '67f23ca3010e19b583ebee14c6aad63622e86b301f740c4b627ef324', 'suresh.superwash.express@gmail.com', '2026-10-22 15:10:54.308208', '2026-10-22 15:10:54.308208', NULL),
	('41add74d-c6cc-4601-afc9-c412edda2ab2', '2f49d987-b97d-43ac-bcbd-b9b73d281c69', 'confirmation_token', '48734d10dcfb83c8a5313bb9bc08bc25394e632d9be7628b64eb221b', 'delivery.associate2@gmail.com', '2026-10-22 16:17:39.59716', '2026-10-22 16:17:39.59716', NULL);


--
-- Data for Name: refresh_tokens; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

INSERT INTO "auth"."refresh_tokens" ("instance_id", "id", "token", "user_id", "revoked", "created_at", "updated_at", "parent", "session_id") VALUES
	('00000000-0000-0000-0000-000000000000', 72, 'q2un2x5kiedm', 'eeb4d846-f42d-4b2e-bcff-b495f4255fa7', false, '2026-10-22 15:47:51.574224+00', '2026-10-22 15:47:51.574224+00', NULL, 'a64414a3-a541-446a-bb53-91ba70c6a8d3'),
	('00000000-0000-0000-0000-000000000000', 74, 'ijreylg5257z', 'eeb4d846-f42d-4b2e-bcff-b495f4255fa7', false, '2026-10-22 15:52:46.953884+00', '2026-10-22 15:52:46.953884+00', NULL, 'c032dcc2-2c24-4629-bec9-f4558bc2912c'),
	('00000000-0000-0000-0000-000000000000', 78, 'hdvtsv63qvsr', 'eeb4d846-f42d-4b2e-bcff-b495f4255fa7', false, '2026-10-22 16:03:56.286492+00', '2026-10-22 16:03:56.286492+00', NULL, '26c0c192-196b-4889-8fe0-c2fbec1b26ba'),
	('00000000-0000-0000-0000-000000000000', 87, '3jmj5h2hfzjk', 'eeb4d846-f42d-4b2e-bcff-b495f4255fa7', false, '2026-10-22 16:49:48.707106+00', '2026-10-22 16:49:48.707106+00', NULL, '0f6cf926-bc01-4ce6-b649-49f8f432e2b9'),
	('00000000-0000-0000-0000-000000000000', 98, 'uw3jipq6b2uy', 'eeb4d846-f42d-4b2e-bcff-b495f4255fa7', false, '2026-10-22 18:01:45.234091+00', '2026-10-22 18:01:45.234091+00', NULL, '9ac3c786-a283-4ffb-9ee9-89b50d80d429'),
	('00000000-0000-0000-0000-000000000000', 95, 'ytffmoc2uepr', 'eeb4d846-f42d-4b2e-bcff-b495f4255fa7', true, '2026-10-22 17:44:54.900544+00', '2026-10-23 00:42:49.455721+00', NULL, 'b311eccd-4299-4e84-b192-4e45a063527d'),
	('00000000-0000-0000-0000-000000000000', 102, 'hdvtytgd3xlu', 'eeb4d846-f42d-4b2e-bcff-b495f4255fa7', true, '2026-10-23 00:42:49.460242+00', '2026-10-23 01:41:14.325588+00', 'ytffmoc2uepr', 'b311eccd-4299-4e84-b192-4e45a063527d'),
	('00000000-0000-0000-0000-000000000000', 103, 'ypevjwuixymo', 'eeb4d846-f42d-4b2e-bcff-b495f4255fa7', false, '2026-10-23 01:41:14.342307+00', '2026-10-23 01:41:14.342307+00', 'hdvtytgd3xlu', 'b311eccd-4299-4e84-b192-4e45a063527d'),
	('00000000-0000-0000-0000-000000000000', 67, 'd23j25fspklp', 'eeb4d846-f42d-4b2e-bcff-b495f4255fa7', false, '2026-10-22 15:45:30.236515+00', '2026-10-22 15:45:30.236515+00', NULL, 'f5fbb7c9-f817-45e7-9a65-a22a4de3cdeb'),
	('00000000-0000-0000-0000-000000000000', 69, 'ospbv6npcewu', 'eeb4d846-f42d-4b2e-bcff-b495f4255fa7', false, '2026-10-22 15:45:43.212462+00', '2026-10-22 15:45:43.212462+00', NULL, '34132b0b-b013-4f42-9870-77b2512287a7');


--
-- Data for Name: sso_providers; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: saml_providers; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: saml_relay_states; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: scim_tokens; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: scim_users; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: sso_domains; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: webauthn_challenges; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: webauthn_credentials; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: business_settings; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."business_settings" ("id", "business_name", "business_phone", "business_address", "price_per_kg_paise", "min_weight_kg", "delivery_charge_paise", "min_order_free_delivery_paise", "upi_id", "upi_qr_url", "payment_collection_stage", "allow_delivery_payment_recording", "whatsapp_enabled", "updated_at", "serviceable_pincodes") VALUES
	('a19714b5-ddb9-4018-9688-f44a81a7f059', 'SuperWash Express', '+91 98765 43210', 'Shop #14, Metro Pillar 78, Indiranagar, Bengaluru 560038', 8000, 3.00, 0, 0, 'superwash@upi', NULL, 'delivery', true, false, '2026-10-22 08:53:58.517232+00', '{560038,560008,560103,560075,560001}');


--
-- Data for Name: profiles; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."profiles" ("id", "phone", "full_name", "role", "is_active", "created_at", "updated_at", "email", "avatar_url") VALUES
	('06fcba51-f920-4278-95d5-b0bc3660c213', '5435678753', 'Gen AI', 'customer', true, '2026-10-22 09:47:09.845428+00', '2026-10-22 12:13:03.904147+00', 'genaidream@gmail.com', 'https://lh3.googleusercontent.com/a/ACg8ocL8D1ff8a_V8SF9AMChTiPXxjYbkVRQBkrhgLIxtCXwIzoY-A=s96-c'),
	('eeb4d846-f42d-4b2e-bcff-b495f4255fa7', '9876543215', 'Ramesh Kumar', 'delivery', true, '2026-10-22 10:28:06.704853+00', '2026-10-22 12:18:16.187903+00', 'superwash.audit.1792664886550@gmail.com', NULL),
	('b80c9cb9-0e8c-4b5b-9b99-ce28e8f9dc3b', NULL, 'customer.test.1792675990753', 'customer', true, '2026-10-22 13:33:11.084415+00', '2026-10-22 13:33:11.084415+00', 'customer.test.1792675990753@gmail.com', NULL),
	('2f49d987-b97d-43ac-bcbd-b9b73d281c69', NULL, 'Suresh Kumar (Associate 2)', 'customer', true, '2026-10-22 16:17:38.193312+00', '2026-10-22 16:17:38.193312+00', 'delivery.associate2@gmail.com', NULL),
	('c32bbcef-818d-4ee9-b92c-315d687d9bd0', '9876543216', 'Suresh Kumar', 'delivery', true, '2026-10-22 15:10:52.903732+00', '2026-10-23 02:14:15.819272+00', 'suresh.superwash.express@gmail.com', NULL),
	('7010c68d-2da3-4ef5-ba16-99c22d00e77a', '9876543211', 'Store Manager Ananya', 'manager', true, '2026-10-22 12:12:02.969863+00', '2026-10-23 02:14:15.819272+00', 'manager@superwash.in', NULL);


--
-- Data for Name: customer_addresses; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."customer_addresses" ("id", "user_id", "label", "address_line", "landmark", "pincode", "is_default", "created_at", "latitude", "longitude") VALUES
	('509f0378-ec64-4ca1-89aa-e4cac2e8c8a5', '06fcba51-f920-4278-95d5-b0bc3660c213', 'Home', 'Wisdom Home Yarab Nagar, Annipura Main Road', '', '560103', true, '2026-10-22 10:13:34.23+00', 12.9178267, 77.5654296);


--
-- Data for Name: services; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."services" ("id", "name", "description", "pricing_unit", "unit_price_paise", "min_weight_kg", "is_active", "display_order", "created_at", "updated_at") VALUES
	('f520c538-65e3-4b64-825e-5fdd3c282e8d', 'Wash & Fold (Normal)', 'Everyday clothes washed with premium gentle detergent, tumble-dried, and neatly steam-iron folded', 'per_kg', 8000, 3.00, true, 1, '2026-10-22 09:08:47.146763+00', '2026-10-22 09:08:47.146763+00');


--
-- Data for Name: orders; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."orders" ("id", "order_number", "customer_id", "customer_name", "customer_phone", "pickup_address", "pickup_landmark", "pickup_pincode", "pickup_date", "pickup_slot", "assigned_delivery_id", "measured_weight", "billable_weight", "price_per_kg_paise", "min_weight_kg", "delivery_charge_paise", "total_amount_paise", "paid_amount_paise", "payment_status", "payment_method", "order_status", "delivery_notes", "cancellation_reason", "notes", "collected_at", "weighed_at", "delivered_at", "created_at", "updated_at", "pickup_latitude", "pickup_longitude", "service_id", "service_name", "pricing_unit", "assigned_pickup_id", "assigned_pickup_name", "assigned_pickup_phone", "assigned_delivery_name", "assigned_delivery_phone", "pickup_measured_weight", "pickup_weighed_at", "pickup_weighed_by") VALUES
	('00000000-0000-4000-c000-000000001004', 'SW-1004', '06fcba51-f920-4278-95d5-b0bc3660c213', 'Aarav Sharma (Isolated Test 1)', '9876543299', 'Flat 301, Palm Grove, Indiranagar', 'Opposite BDA Complex', '560038', '2026-10-23', 'Morning (08:00 AM - 11:00 AM)', 'eeb4d846-f42d-4b2e-bcff-b495f4255fa7', 4.50, 4.50, 8000, 3.00, 0, 36000, 36000, 'paid', 'upi_manual', 'delivered', NULL, 'Store Manager Ananya', 'Dispatched with delivery agent Ramesh Kumar', '2026-10-22 17:38:42.336+00', '2026-10-22 17:39:34.444+00', '2026-10-22 17:48:05.863+00', '2026-10-22 17:19:22.763027+00', '2026-10-22 17:48:05.863+00', NULL, NULL, NULL, 'Wash & Fold (Normal)', 'per_kg', 'eeb4d846-f42d-4b2e-bcff-b495f4255fa7', 'Ramesh Kumar', '9876543215', 'Ramesh Kumar', '9876543215', NULL, NULL, NULL),
	('00000000-0000-4000-c000-000000001005', 'SW-1005', '06fcba51-f920-4278-95d5-b0bc3660c213', 'Meera Iyer (Isolated Test 2)', '9876543298', 'Villa 12, Palm Meadows, Whitefield', 'Near Club House', '560066', '2026-10-23', 'Morning (08:00 AM - 11:00 AM)', NULL, NULL, NULL, 8000, 3.00, 0, NULL, 0, 'pending', 'cash', 'pickup_assigned', NULL, NULL, 'Isolated Verification Order 2', NULL, NULL, NULL, '2026-10-22 17:19:23.031584+00', '2026-10-22 17:38:15.331+00', NULL, NULL, NULL, 'Wash & Fold (Normal)', 'per_kg', 'eeb4d846-f42d-4b2e-bcff-b495f4255fa7', 'Ramesh Kumar', '9876543215', NULL, NULL, NULL, NULL, NULL),
	('f16453e1-713f-49ce-af3f-d09a0ceffd0e', 'SW-1003', '06fcba51-f920-4278-95d5-b0bc3660c213', 'Gen AI', '5435678753', 'Wisdom Home Yarab Nagar, Annipura Main Road', '', '560103', '2026-10-22', 'Morning (08:00 AM - 11:00 AM)', 'eeb4d846-f42d-4b2e-bcff-b495f4255fa7', 3.00, 3.00, 8000, 3.00, 0, 24000, 24000, 'paid', 'cash', 'delivered', 'Delivered directly to customer doorstep by Ramesh', 'Store Manager Ananya', 'Clothes washed, dried, packed and ready for delivery', '2026-10-22 15:45:58.875+00', '2026-10-22 15:45:58.875+00', '2026-10-22 16:03:57.071+00', '2026-10-22 15:45:16.846+00', '2026-10-22 16:03:57.071+00', 12.9178267, 77.5654296, NULL, 'Wash & Fold (Normal)', 'per_kg', 'eeb4d846-f42d-4b2e-bcff-b495f4255fa7', 'Ramesh Kumar', '9876543215', 'Ramesh Kumar', '9876543215', NULL, NULL, NULL),
	('35ad5b69-c5de-4cbe-a148-0b52ab3424dd', 'SW-1002', '06fcba51-f920-4278-95d5-b0bc3660c213', 'Gen AI', '5435678753', 'Wisdom Home Yarab Nagar, Annipura Main Road', '', '560103', '2026-10-22', 'Morning (08:00 AM - 11:00 AM)', 'c32bbcef-818d-4ee9-b92c-315d687d9bd0', 4.25, 4.25, 8000, 3.00, 0, 34000, 0, 'pending', 'cash', 'delivered', 'Delivered clean clothes to customer by Suresh Kumar', 'Store Manager Ananya', 'Clothes washed, dried, packed and ready for delivery', '2026-10-22 15:15:10.679+00', '2026-10-22 15:15:10.693+00', '2026-10-22 16:04:50.398+00', '2026-10-22 14:49:29.034+00', '2026-10-22 16:04:50.398+00', 12.9178267, 77.5654296, NULL, 'Wash & Fold (Normal)', 'per_kg', 'eeb4d846-f42d-4b2e-bcff-b495f4255fa7', 'Ramesh Kumar', '9876543215', 'Suresh Kumar', '9876543216', NULL, NULL, NULL),
	('adb80cbe-5180-4dbf-a7fc-52abc02bf8fa', 'SW-1001', '06fcba51-f920-4278-95d5-b0bc3660c213', 'Gen AI', '5435678753', 'Wisdom Home Yarab Nagar, Annipura Main Road', '', '560103', '2026-10-22', 'Morning (08:00 AM - 11:00 AM)', 'eeb4d846-f42d-4b2e-bcff-b495f4255fa7', 3.00, 3.00, 8000, 3.00, 0, 24000, 24000, 'paid', 'cash', 'delivered', NULL, 'Store Manager Ananya', 'Clothes washed, dried, packed and ready for delivery', '2026-10-22 12:11:42.12+00', '2026-10-22 12:11:02.09+00', '2026-10-22 14:21:26.878+00', '2026-10-22 10:13:35.342+00', '2026-10-22 14:21:26.878+00', 12.9178267, 77.5654296, NULL, 'Wash & Fold (Normal)', 'per_kg', 'eeb4d846-f42d-4b2e-bcff-b495f4255fa7', 'Ramesh Kumar', '9876543215', 'Ramesh Kumar', '9876543215', NULL, NULL, NULL);


--
-- Data for Name: notification_logs; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."notification_logs" ("id", "order_id", "channel", "recipient_phone", "event_type", "message", "status", "error_message", "created_at") VALUES
	('aefabf21-9cb7-49e4-b7c9-2c7cf080b704', 'adb80cbe-5180-4dbf-a7fc-52abc02bf8fa', 'whatsapp', '5435678753', 'pickup_assigned', 'Hello Gen AI, our pickup executive Ramesh Kumar (9876543215) has been assigned for Order #SW-1001. They will arrive at your address during the scheduled slot (Morning (08:00 AM - 11:00 AM)).', 'logged', 'Failed to send a request to the Edge Function', '2026-10-22 12:10:15.506+00'),
	('0fe9b116-14d2-481f-aff4-eaa93474af99', 'adb80cbe-5180-4dbf-a7fc-52abc02bf8fa', 'whatsapp', '5435678753', 'clothes_collected', 'Hello Gen AI, our delivery executive has collected your clothes (Order #SW-1001). They are now on their way to the store for weighing and washing.', 'logged', 'Failed to send a request to the Edge Function', '2026-10-22 12:10:50.26+00'),
	('875cbfae-d0c7-468a-816f-1ee5fc5727a8', 'adb80cbe-5180-4dbf-a7fc-52abc02bf8fa', 'whatsapp', '5435678753', 'weight_and_bill_ready', 'Order #SW-1001 Update: Your clothes weighed 3.00 kg (Billable: 3.00 kg @ ₹80/kg). Total Bill: ₹240. Washing is now underway!', 'logged', 'Failed to send a request to the Edge Function', '2026-10-22 12:11:02.601+00'),
	('d8057919-2410-4e0c-8289-630857eb2698', 'adb80cbe-5180-4dbf-a7fc-52abc02bf8fa', 'whatsapp', '5435678753', 'ready_for_delivery', 'Great news! Order #SW-1001 is clean, steam-ironed, and ready for delivery. Our delivery executive will arrive shortly. Amount due: ₹240.', 'logged', 'Failed to send a request to the Edge Function', '2026-10-22 12:11:15.58+00'),
	('cc7bfebc-b0c6-4650-abe1-3c3bd3c5526d', 'adb80cbe-5180-4dbf-a7fc-52abc02bf8fa', 'whatsapp', '5435678753', 'pickup_assigned', 'Hello Gen AI, our pickup executive Ramesh Kumar (9876543215) has been assigned for Order #SW-1001. They will arrive at your address during the scheduled slot (Morning (08:00 AM - 11:00 AM)).', 'logged', 'Failed to send a request to the Edge Function', '2026-10-22 12:11:22.515+00'),
	('4032f5b1-2d8c-4900-8760-10c51f8af23c', 'adb80cbe-5180-4dbf-a7fc-52abc02bf8fa', 'whatsapp', '5435678753', 'clothes_collected', 'Hello Gen AI, our delivery executive has collected your clothes (Order #SW-1001). They are now on their way to the store for weighing and washing.', 'logged', 'Failed to send a request to the Edge Function', '2026-10-22 12:11:42.465+00'),
	('1a587f38-3036-4e70-bf90-bac164f4db73', 'adb80cbe-5180-4dbf-a7fc-52abc02bf8fa', 'whatsapp', '5435678753', 'ready_for_delivery', 'Great news! Order #SW-1001 is clean, steam-ironed, and ready for delivery. Our delivery executive will arrive shortly. Amount due: ₹240.', 'logged', 'Failed to send a request to the Edge Function', '2026-10-22 12:12:11.192+00'),
	('c435fa1e-6b3e-4a77-832f-fb964b770b2b', 'adb80cbe-5180-4dbf-a7fc-52abc02bf8fa', 'whatsapp', '5435678753', 'ready_for_delivery', 'Great news! Order #SW-1001 is clean, steam-ironed, and ready for delivery. Our delivery executive will arrive shortly. Amount due: ₹240.', 'logged', 'Failed to send a request to the Edge Function', '2026-10-22 13:22:48.988+00'),
	('801a8460-10af-4b4d-9b1c-5b8aa350c83a', 'adb80cbe-5180-4dbf-a7fc-52abc02bf8fa', 'whatsapp', '5435678753', 'payment_received', 'Receipt: Received ₹240 via Cash for SuperWash Order #SW-1001. Remaining Balance: ₹0. Thank you!', 'logged', 'Failed to send a request to the Edge Function', '2026-10-22 14:18:10.212+00'),
	('e68dbf86-7c8f-41e8-87d4-1a69b8162324', 'adb80cbe-5180-4dbf-a7fc-52abc02bf8fa', 'whatsapp', '5435678753', 'order_delivered', 'Namaste Gen AI! Your clean clothes for order #SW-1001 have been delivered. Thank you for choosing SuperWash!', 'logged', 'Failed to send a request to the Edge Function', '2026-10-22 14:21:27.808+00'),
	('f3853920-54ea-4695-91e5-c001edecd7a9', '35ad5b69-c5de-4cbe-a148-0b52ab3424dd', 'whatsapp', '5435678753', 'pickup_assigned', 'Hello Gen AI, our pickup executive Ramesh Kumar (9876543215) has been assigned for Order #SW-1002. They will arrive at your address during the scheduled slot (Morning (08:00 AM - 11:00 AM)).', 'logged', 'Failed to send a request to the Edge Function', '2026-10-22 14:49:52.915+00'),
	('2b67e59e-c324-4721-9f2b-acda8bcf9ccd', '35ad5b69-c5de-4cbe-a148-0b52ab3424dd', 'whatsapp', '5435678753', 'clothes_collected', 'Hello Gen AI, our delivery executive has collected your clothes (Order #SW-1002). They are now on their way to the store for weighing and washing.', 'logged', 'Failed to send a request to the Edge Function', '2026-10-22 14:50:20.52+00'),
	('59e45d7d-e92a-4d18-a915-d36fea3ca9a2', '35ad5b69-c5de-4cbe-a148-0b52ab3424dd', 'whatsapp', '5435678753', 'weight_and_bill_ready', 'Order #SW-1002 Update: Your clothes weighed 5.00 kg (Billable: 5.00 kg @ ₹80/kg). Total Bill: ₹400. Washing is now underway!', 'logged', 'Failed to send a request to the Edge Function', '2026-10-22 14:55:33.13+00'),
	('c3147b2f-f69a-404c-9fdf-70e4751f4a3e', '35ad5b69-c5de-4cbe-a148-0b52ab3424dd', 'whatsapp', '5435678753', 'ready_for_delivery', 'Great news! Order #SW-1002 is clean, steam-ironed, and ready for delivery. Our delivery executive will arrive shortly. Amount due: ₹400.', 'logged', 'Failed to send a request to the Edge Function', '2026-10-22 14:55:41.896+00'),
	('3f666548-efa8-4519-8e40-d9c47bb337d8', '35ad5b69-c5de-4cbe-a148-0b52ab3424dd', 'whatsapp', '5435678753', 'pickup_assigned', 'Hello Gen AI, our pickup executive Ramesh Kumar (9876543215) has been assigned for Order #SW-1002. They will arrive at your address during the scheduled slot (Morning (08:00 AM - 11:00 AM)).', 'logged', 'Failed to send a request to the Edge Function', '2026-10-22 14:55:46.438+00'),
	('974667fe-068a-4020-b562-19ab87473197', '35ad5b69-c5de-4cbe-a148-0b52ab3424dd', 'whatsapp', '5435678753', 'clothes_collected', 'Hello Gen AI, our delivery executive has collected your clothes (Order #SW-1002). They are now on their way to the store for weighing and washing.', 'logged', 'Failed to send a request to the Edge Function', '2026-10-22 14:57:29.653+00'),
	('46d4e5a6-a2be-4302-a77b-a9ad3d0bf046', '35ad5b69-c5de-4cbe-a148-0b52ab3424dd', 'whatsapp', '5435678753', 'ready_for_delivery', 'Great news! Order #SW-1002 is clean, steam-ironed, and ready for delivery. Our delivery executive will arrive shortly. Amount due: ₹400.', 'logged', 'Failed to send a request to the Edge Function', '2026-10-22 14:57:41.639+00'),
	('f4d15678-8644-4d62-ad4e-72791454a8ec', '35ad5b69-c5de-4cbe-a148-0b52ab3424dd', 'whatsapp', '5435678753', 'pickup_assigned', 'Hello Gen AI, our pickup executive Ramesh Kumar (9876543215) has been assigned for Order #SW-1002. They will arrive at your address during the scheduled slot (Morning (08:00 AM - 11:00 AM)).', 'logged', 'Failed to send a request to the Edge Function', '2026-10-22 14:57:46.3+00'),
	('8553888c-f648-40cb-b89e-4b4250ab60c6', '35ad5b69-c5de-4cbe-a148-0b52ab3424dd', 'whatsapp', '5435678753', 'clothes_collected', 'Hello Gen AI, our delivery executive has collected your clothes (Order #SW-1002). They are now on their way to the store for weighing and washing.', 'logged', 'Failed to send a request to the Edge Function', '2026-10-22 14:57:57.216+00'),
	('e144ebaa-2d69-4893-b97c-a6539befe74d', '35ad5b69-c5de-4cbe-a148-0b52ab3424dd', 'whatsapp', '5435678753', 'ready_for_delivery', 'Great news! Order #SW-1002 is clean, steam-ironed, and ready for delivery. Our delivery executive will arrive shortly. Amount due: ₹400.', 'logged', 'Failed to send a request to the Edge Function', '2026-10-22 15:02:57.669+00'),
	('7211938b-d51d-408a-beeb-59e76ca4049f', '35ad5b69-c5de-4cbe-a148-0b52ab3424dd', 'whatsapp', '5435678753', 'pickup_assigned', 'Hello Gen AI, our pickup executive Ramesh Kumar (9876543215) has been assigned for Order #SW-1002. They will arrive at your address during the scheduled slot (Morning (08:00 AM - 11:00 AM)).', 'logged', 'Failed to send a request to the Edge Function', '2026-10-22 15:03:01.634+00'),
	('8b6b3647-69f5-40ae-8760-8d961ee47754', 'f16453e1-713f-49ce-af3f-d09a0ceffd0e', 'whatsapp', '5435678753', 'pickup_assigned', 'Hello Gen AI, our pickup executive Ramesh Kumar (9876543215) has been assigned for Order #SW-1003. They will arrive at your address during the scheduled slot (Morning (08:00 AM - 11:00 AM)).', 'logged', 'Failed to send a request to the Edge Function', '2026-10-22 15:45:39.52+00'),
	('56de2595-4080-4de2-910c-186a2eb0ae3f', 'f16453e1-713f-49ce-af3f-d09a0ceffd0e', 'whatsapp', '5435678753', 'clothes_collected', 'Hello Gen AI, our pickup executive Ramesh Kumar has collected your clothes (Order #SW-1003). Doorstep measured weight: 3.00 kg. Total Bill: ₹240.00. They are now on their way to the store for washing!', 'logged', 'Failed to send a request to the Edge Function', '2026-10-22 15:45:59.257+00'),
	('4090f69b-05ca-49b5-a201-3556ab9e74e8', 'f16453e1-713f-49ce-af3f-d09a0ceffd0e', 'whatsapp', '5435678753', 'ready_for_delivery', 'Great news! Order #SW-1003 is clean, steam-ironed, and ready for delivery. Our delivery executive will arrive shortly. Amount due: ₹240.', 'logged', 'Failed to send a request to the Edge Function', '2026-10-22 15:47:44.388+00'),
	('2862e477-a9a4-4992-910b-e65010f65b59', 'f16453e1-713f-49ce-af3f-d09a0ceffd0e', 'whatsapp', '5435678753', 'payment_received', 'Receipt: Received ₹240 via Cash for SuperWash Order #SW-1003. Remaining Balance: ₹0. Thank you!', 'logged', 'Failed to send a request to the Edge Function', '2026-10-22 15:48:13.64+00'),
	('b0bb7971-74bc-4095-8889-786a8150b485', '00000000-0000-4000-c000-000000001004', 'whatsapp', '9876543299', 'pickup_assigned', 'Hello Aarav Sharma (Isolated Test 1), our pickup executive Ramesh Kumar (9876543215) has been assigned for Order #SW-1004. They will arrive at your address during the scheduled slot (Morning (08:00 AM - 11:00 AM)).', 'logged', 'Failed to send a request to the Edge Function', '2026-10-22 17:37:43.613+00'),
	('5a2ef454-bf0e-478d-bfa2-a7d37033df55', '00000000-0000-4000-c000-000000001005', 'whatsapp', '9876543298', 'pickup_assigned', 'Hello Meera Iyer (Isolated Test 2), our pickup executive Ramesh Kumar (9876543215) has been assigned for Order #SW-1005. They will arrive at your address during the scheduled slot (Morning (08:00 AM - 11:00 AM)).', 'logged', 'Failed to send a request to the Edge Function', '2026-10-22 17:38:16.04+00'),
	('deb17d52-0134-456d-b285-847ac5a07276', '00000000-0000-4000-c000-000000001004', 'whatsapp', '9876543299', 'clothes_collected', 'Hello Aarav Sharma (Isolated Test 1), our delivery executive has collected your clothes (Order #SW-1004). They are now on their way to the store for weighing and washing.', 'logged', 'Failed to send a request to the Edge Function', '2026-10-22 17:38:42.825+00'),
	('19fb0c21-d1b5-4462-a104-6821f6bfd2ef', '00000000-0000-4000-c000-000000001004', 'whatsapp', '9876543299', 'weight_and_bill_ready', 'Order #SW-1004 Update: Your clothes weighed 4.50 kg (Billable: 4.50 kg @ ₹80/kg). Total Bill: ₹360. Washing is now underway!', 'logged', 'Failed to send a request to the Edge Function', '2026-10-22 17:39:35.371+00'),
	('a40390a6-c283-4343-8fe5-65b2e4cf6a46', '00000000-0000-4000-c000-000000001004', 'whatsapp', '9876543299', 'ready_for_delivery', 'Great news! Order #SW-1004 is clean, steam-ironed, and ready for delivery. Our delivery executive will arrive shortly. Amount due: ₹360.', 'logged', 'Failed to send a request to the Edge Function', '2026-10-22 17:40:17.246+00'),
	('f22d4f54-8080-457e-906b-a616d455d079', '00000000-0000-4000-c000-000000001004', 'whatsapp', '9876543299', 'payment_received', 'Receipt: Received ₹360 via UPI for SuperWash Order #SW-1004. Remaining Balance: ₹0. Thank you!', 'logged', 'Failed to send a request to the Edge Function', '2026-10-22 17:47:43.727+00'),
	('48afe0fd-6ee0-4b68-9d5d-d383e3e0746f', '00000000-0000-4000-c000-000000001004', 'whatsapp', '9876543299', 'order_delivered', 'Namaste Aarav Sharma (Isolated Test 1)! Your clean clothes for order #SW-1004 have been delivered. Thank you for choosing SuperWash!', 'logged', 'Failed to send a request to the Edge Function', '2026-10-22 17:48:06.491+00');


--
-- Data for Name: order_feedback; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: order_status_history; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."order_status_history" ("id", "order_id", "previous_status", "new_status", "notes", "changed_by", "created_at") VALUES
	('f863e0da-8fe0-4474-a02f-165a45c92e3d', 'adb80cbe-5180-4dbf-a7fc-52abc02bf8fa', 'booked', 'pickup_assigned', 'Pickup assigned to Ramesh Kumar (9876543215)', NULL, '2026-10-22 12:10:15.274709+00'),
	('84877139-e2cb-40b1-a9dc-eecb99ed8bb3', 'adb80cbe-5180-4dbf-a7fc-52abc02bf8fa', 'pickup_assigned', 'collected', 'Clothes collected from doorstep', NULL, '2026-10-22 12:10:50.011464+00'),
	('504717e9-c1b9-4754-8bf5-4926ec3e6810', 'adb80cbe-5180-4dbf-a7fc-52abc02bf8fa', 'collected', 'washing', 'Weighed: 3.00 kg (Billable: 3.00 kg @ ₹80/kg = ₹240)', NULL, '2026-10-22 12:11:02.368634+00'),
	('1d0daf53-e9a3-4dc1-93da-3501db07d60d', 'adb80cbe-5180-4dbf-a7fc-52abc02bf8fa', 'washing', 'ready_for_delivery', 'Clothes washed, dried, packed and ready for delivery', NULL, '2026-10-22 12:11:15.347889+00'),
	('63a60a1d-6893-4fdb-8a1d-9f883fc0a434', 'adb80cbe-5180-4dbf-a7fc-52abc02bf8fa', 'ready_for_delivery', 'pickup_assigned', 'Pickup assigned to Ramesh Kumar (9876543215)', NULL, '2026-10-22 12:11:22.283067+00'),
	('cc1bd451-fed8-443d-8b72-95e92a034bf4', 'adb80cbe-5180-4dbf-a7fc-52abc02bf8fa', 'pickup_assigned', 'collected', 'Clothes collected from doorstep', NULL, '2026-10-22 12:11:42.234327+00'),
	('a7316768-01be-4a7b-9c22-db33700c1150', 'adb80cbe-5180-4dbf-a7fc-52abc02bf8fa', 'collected', 'washing', 'Clothes placed into washing machine', NULL, '2026-10-22 12:12:07.539561+00'),
	('9848cdaf-6ef4-4c95-837a-e9169d25859d', 'adb80cbe-5180-4dbf-a7fc-52abc02bf8fa', 'washing', 'ready_for_delivery', 'Clothes washed, dried, packed and ready for delivery', NULL, '2026-10-22 12:12:10.960867+00'),
	('6f9de93a-6113-49b5-9285-8632070cf745', 'adb80cbe-5180-4dbf-a7fc-52abc02bf8fa', 'pickup_assigned', 'washing', 'Clothes placed into washing machine', NULL, '2026-10-22 13:22:44.62616+00'),
	('32252b0f-c8c4-4204-8800-823447bc28e3', 'adb80cbe-5180-4dbf-a7fc-52abc02bf8fa', 'washing', 'ready_for_delivery', 'Clothes washed, dried, packed and ready for delivery', NULL, '2026-10-22 13:22:48.753137+00'),
	('8462194a-26a2-4552-b89a-00fee4b88e9d', 'adb80cbe-5180-4dbf-a7fc-52abc02bf8fa', 'ready_for_delivery', 'ready_for_delivery', 'Delivery associate assigned: Ramesh Kumar (9876543215)', NULL, '2026-10-22 13:52:58.013428+00'),
	('51f92b07-66f1-45d2-bc3d-232fe6c8d93e', 'adb80cbe-5180-4dbf-a7fc-52abc02bf8fa', 'ready_for_delivery', 'delivered', 'Clean clothes delivered to customer', NULL, '2026-10-22 14:21:27.569455+00'),
	('3a506efe-eb3e-4f7c-b073-91d7c52319d8', '35ad5b69-c5de-4cbe-a148-0b52ab3424dd', 'booked', 'pickup_assigned', 'Pickup assigned to Ramesh Kumar (9876543215)', NULL, '2026-10-22 14:49:52.644092+00'),
	('40adc897-4527-4bfd-b891-d5af40d937df', '35ad5b69-c5de-4cbe-a148-0b52ab3424dd', 'pickup_assigned', 'collected', 'Clothes collected from doorstep', NULL, '2026-10-22 14:50:20.273336+00'),
	('a2bd5352-163b-4145-8874-748a272bdca2', '35ad5b69-c5de-4cbe-a148-0b52ab3424dd', 'collected', 'washing', 'Weighed: 5.00 kg (Billable: 5.00 kg @ ₹80/kg = ₹400)', NULL, '2026-10-22 14:55:32.851195+00'),
	('c478bd54-14a8-42a6-a5e5-fb99ab660426', '35ad5b69-c5de-4cbe-a148-0b52ab3424dd', 'washing', 'ready_for_delivery', 'Clothes washed, dried, packed and ready for delivery', NULL, '2026-10-22 14:55:41.638907+00'),
	('e4ba776b-8c63-480d-bafb-db9416352f57', '35ad5b69-c5de-4cbe-a148-0b52ab3424dd', 'ready_for_delivery', 'pickup_assigned', 'Pickup assigned to Ramesh Kumar (9876543215)', NULL, '2026-10-22 14:55:46.200347+00'),
	('9e281516-3931-4e49-a9b4-828902caecc0', '35ad5b69-c5de-4cbe-a148-0b52ab3424dd', 'pickup_assigned', 'collected', 'Clothes collected from doorstep', NULL, '2026-10-22 14:57:29.403035+00'),
	('a75bd225-7143-4fd5-b09a-62362129746a', '35ad5b69-c5de-4cbe-a148-0b52ab3424dd', 'collected', 'washing', 'Clothes placed into washing machine', NULL, '2026-10-22 14:57:38.505364+00'),
	('e01a422a-36a2-494d-a1ed-913834e8ad04', '35ad5b69-c5de-4cbe-a148-0b52ab3424dd', 'washing', 'ready_for_delivery', 'Clothes washed, dried, packed and ready for delivery', NULL, '2026-10-22 14:57:41.38908+00'),
	('145a696f-9836-4b03-b7d7-fa82fea3d2a6', '35ad5b69-c5de-4cbe-a148-0b52ab3424dd', 'ready_for_delivery', 'pickup_assigned', 'Pickup assigned to Ramesh Kumar (9876543215)', NULL, '2026-10-22 14:57:46.071991+00'),
	('5e58ead8-7fce-4194-8cdb-f00633b25f5a', '35ad5b69-c5de-4cbe-a148-0b52ab3424dd', 'pickup_assigned', 'collected', 'Clothes collected from doorstep', NULL, '2026-10-22 14:57:56.985909+00'),
	('b4f3a495-9752-446d-a1ab-1f67fe761c33', '35ad5b69-c5de-4cbe-a148-0b52ab3424dd', 'collected', 'washing', 'Clothes placed into washing machine', NULL, '2026-10-22 15:02:55.353341+00'),
	('32105e19-1a0f-4c32-8b9b-ea6fe6c94bed', '35ad5b69-c5de-4cbe-a148-0b52ab3424dd', 'washing', 'ready_for_delivery', 'Clothes washed, dried, packed and ready for delivery', NULL, '2026-10-22 15:02:57.432031+00'),
	('bea0e73c-a412-41e8-afca-ae3c57475fcd', '35ad5b69-c5de-4cbe-a148-0b52ab3424dd', 'ready_for_delivery', 'pickup_assigned', 'Pickup assigned to Ramesh Kumar (9876543215)', NULL, '2026-10-22 15:03:01.395671+00'),
	('7e7ff9b3-bafc-4af2-8bc4-342c22b35d17', '35ad5b69-c5de-4cbe-a148-0b52ab3424dd', 'pickup_assigned', 'collected', 'Doorstep collection test', 'eeb4d846-f42d-4b2e-bcff-b495f4255fa7', '2026-10-22 15:15:00.537001+00'),
	('45601558-d075-4ee3-aed0-9b5189842910', 'f16453e1-713f-49ce-af3f-d09a0ceffd0e', 'booked', 'pickup_assigned', 'Pickup assigned to Ramesh Kumar (9876543215)', 'eeb4d846-f42d-4b2e-bcff-b495f4255fa7', '2026-10-22 15:45:39.271202+00'),
	('b62149fb-7e55-430e-9452-9ed65e48085e', 'f16453e1-713f-49ce-af3f-d09a0ceffd0e', 'pickup_assigned', 'collected', 'Collected & weighed at doorstep: 3.00 kg (Bill: ₹240.00) by Ramesh Kumar', 'eeb4d846-f42d-4b2e-bcff-b495f4255fa7', '2026-10-22 15:45:59.024907+00'),
	('9c4a4a61-36eb-4809-b25c-9ce8b0636eaf', 'f16453e1-713f-49ce-af3f-d09a0ceffd0e', 'collected', 'washing', 'Clothes placed into washing machine', NULL, '2026-10-22 15:47:02.658066+00'),
	('808f3eea-863f-4eb4-8ef5-3876445b2c95', 'f16453e1-713f-49ce-af3f-d09a0ceffd0e', 'washing', 'ready_for_delivery', 'Clothes washed, dried, packed and ready for delivery', NULL, '2026-10-22 15:47:44.148+00'),
	('25dfa520-89b4-4834-a6f4-88685a9f5186', 'f16453e1-713f-49ce-af3f-d09a0ceffd0e', 'ready_for_delivery', 'ready_for_delivery', 'Delivery courier assigned: Ramesh Kumar (9876543215)', 'eeb4d846-f42d-4b2e-bcff-b495f4255fa7', '2026-10-22 15:47:49.293318+00'),
	('9ac01e18-bd02-481f-917d-4b153b9bd5d2', '00000000-0000-4000-c000-000000001004', 'booked', 'pickup_assigned', 'Pickup assigned to Ramesh Kumar (9876543215)', 'eeb4d846-f42d-4b2e-bcff-b495f4255fa7', '2026-10-22 17:37:43.270191+00'),
	('63f439df-7a42-4b90-b4e1-23b42dce1f2e', '00000000-0000-4000-c000-000000001005', 'booked', 'pickup_assigned', 'Pickup assigned to Ramesh Kumar (9876543215)', 'eeb4d846-f42d-4b2e-bcff-b495f4255fa7', '2026-10-22 17:38:15.779434+00'),
	('b30383e8-976c-4284-a771-aa573054652b', '00000000-0000-4000-c000-000000001004', 'pickup_assigned', 'collected', 'Clothes received at store intake', NULL, '2026-10-22 17:38:42.573156+00'),
	('2aeebb84-1f8a-4db2-935b-17db1c3ea794', '00000000-0000-4000-c000-000000001004', 'collected', 'washing', 'Weighed: 4.50 kg (Billable: 4.50 kg @ ₹80/kg = ₹360)', NULL, '2026-10-22 17:39:35.077336+00'),
	('ab1bf6f3-6160-4755-9d8a-2d6b74a95930', '00000000-0000-4000-c000-000000001004', 'washing', 'ready_for_delivery', 'Clothes washed, dried, packed and ready for delivery', NULL, '2026-10-22 17:40:16.976468+00'),
	('33076b66-b34f-4101-a395-34eeb2b45752', '00000000-0000-4000-c000-000000001004', 'ready_for_delivery', 'ready_for_delivery', 'Delivery courier assigned: Ramesh Kumar (9876543215)', 'eeb4d846-f42d-4b2e-bcff-b495f4255fa7', '2026-10-22 17:40:58.517433+00'),
	('28228dc3-10b1-4130-a4c8-e21c450e63f0', '00000000-0000-4000-c000-000000001004', 'ready_for_delivery', 'out_for_delivery', 'Dispatched with delivery agent Ramesh Kumar', NULL, '2026-10-22 17:42:04.748558+00'),
	('47765eb1-1c43-40fb-bca5-69ca0c999946', '00000000-0000-4000-c000-000000001004', 'out_for_delivery', 'delivered', 'Clean clothes delivered to customer', NULL, '2026-10-22 17:48:06.063312+00');


--
-- Data for Name: payments; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."payments" ("id", "order_id", "amount_paise", "payment_method", "transaction_reference", "notes", "recorded_by", "created_at", "idempotency_key") VALUES
	('35f2fb02-15c6-4867-98b9-60edf9b5ad76', 'adb80cbe-5180-4dbf-a7fc-52abc02bf8fa', 24000, 'cash', NULL, 'Cash collected by Ramesh Kumar at doorstep', 'eeb4d846-f42d-4b2e-bcff-b495f4255fa7', '2026-10-22 14:14:21.934957+00', NULL),
	('0a5e23e3-fe7f-4919-9f7c-f6acd4c5189a', 'adb80cbe-5180-4dbf-a7fc-52abc02bf8fa', 24000, 'cash', NULL, 'Recorded by: Ramesh Kumar', 'eeb4d846-f42d-4b2e-bcff-b495f4255fa7', '2026-10-22 14:18:09.235+00', NULL),
	('23a6ba77-fc34-4c50-88c3-b79c7705cbb6', 'f16453e1-713f-49ce-af3f-d09a0ceffd0e', 24000, 'cash', NULL, 'Recorded by: Ramesh Kumar', 'eeb4d846-f42d-4b2e-bcff-b495f4255fa7', '2026-10-22 15:48:13.029+00', NULL),
	('74efc5e6-9aa0-41be-be51-a6a940d7d373', '00000000-0000-4000-c000-000000001004', 36000, 'upi_manual', '123456789012', 'Recorded by: Ramesh Kumar', 'eeb4d846-f42d-4b2e-bcff-b495f4255fa7', '2026-10-22 17:47:42.732+00', NULL);


--
-- Data for Name: pickup_slots; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."pickup_slots" ("id", "name", "start_time", "end_time", "max_capacity", "is_active") VALUES
	('bca3135a-5fa8-40b5-8acb-cfcd42d6315c', 'Morning (08:00 AM - 11:00 AM)', '08:00:00', '11:00:00', 20, true),
	('5530964a-364d-47ee-bbed-73594978f9c7', 'Noon (11:00 AM - 02:00 PM)', '11:00:00', '14:00:00', 20, true),
	('101d3591-cbc6-42d2-92a9-ee7a334a99d3', 'Afternoon (02:00 PM - 05:00 PM)', '14:00:00', '17:00:00', 20, true),
	('021255aa-1668-4f84-92ad-235df7b59266', 'Evening (05:00 PM - 08:00 PM)', '17:00:00', '20:00:00', 20, true);


--
-- Data for Name: service_areas; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."service_areas" ("id", "pincode", "area_name", "city", "state", "is_active", "created_at", "updated_at") VALUES
	('0e30ce1e-7870-4e13-964c-d10acec2b89c', '560038', 'Indiranagar', 'Bengaluru', 'Karnataka', true, '2026-10-22 09:08:47.146763+00', '2026-10-22 09:08:47.146763+00'),
	('3593442c-e462-4458-980e-f1c58b63825b', '560008', 'Ulsoor / Halasuru', 'Bengaluru', 'Karnataka', true, '2026-10-22 09:08:47.146763+00', '2026-10-22 09:08:47.146763+00'),
	('c0f3896f-4e07-46a9-8564-139e4a38e924', '560103', 'Bellandur', 'Bengaluru', 'Karnataka', true, '2026-10-22 09:08:47.146763+00', '2026-10-22 09:08:47.146763+00'),
	('902688b3-a8c2-4ee3-82a7-d5e88c555bf1', '560075', 'HAL / Airport Road', 'Bengaluru', 'Karnataka', true, '2026-10-22 09:08:47.146763+00', '2026-10-22 09:08:47.146763+00'),
	('230bcdbb-b58a-4c56-b50e-d7828cba8e59', '560001', 'MG Road / Central Bengaluru', 'Bengaluru', 'Karnataka', true, '2026-10-22 09:08:47.146763+00', '2026-10-22 09:08:47.146763+00'),
	('35b5c59c-92c5-4272-b63e-f2c9ac614f08', '560066', 'Whitefield', 'Bengaluru', 'Karnataka', true, '2026-10-22 09:08:47.146763+00', '2026-10-22 09:08:47.146763+00'),
	('9cb5d8d5-f599-4f54-8a23-c6a55c46aeb3', '560037', 'Marathahalli', 'Bengaluru', 'Karnataka', true, '2026-10-22 09:08:47.146763+00', '2026-10-22 09:08:47.146763+00');


--
-- Data for Name: weight_change_history; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."weight_change_history" ("id", "order_id", "old_weight", "new_weight", "old_amount_paise", "new_amount_paise", "reason", "changed_by", "created_at") VALUES
	('3a0cfa84-40bc-49e7-8b58-18f46f16736d', 'adb80cbe-5180-4dbf-a7fc-52abc02bf8fa', NULL, 3.00, NULL, 24000, 'Initial intake weight', NULL, '2026-10-22 12:11:02.211196+00'),
	('ddf50736-e837-48f4-b29f-5e8bf3783fce', '35ad5b69-c5de-4cbe-a148-0b52ab3424dd', NULL, 5.00, NULL, 40000, 'Initial intake weight', NULL, '2026-10-22 14:55:32.350758+00'),
	('540f970f-8060-4192-9dbd-bef179750ce8', '35ad5b69-c5de-4cbe-a148-0b52ab3424dd', NULL, 4.25, NULL, 34000, 'Initial doorstep weighing by pickup associate', '7010c68d-2da3-4ef5-ba16-99c22d00e77a', '2026-10-22 15:14:51.371381+00'),
	('740e7211-05b7-4bc3-9811-e351fed76693', '00000000-0000-4000-c000-000000001004', NULL, 4.50, NULL, 36000, 'Initial intake weight', NULL, '2026-10-22 17:39:34.798181+00');


--
-- Data for Name: buckets; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--



--
-- Data for Name: buckets_analytics; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--



--
-- Data for Name: buckets_vectors; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--



--
-- Data for Name: objects; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--



--
-- Data for Name: s3_multipart_uploads; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--



--
-- Data for Name: s3_multipart_uploads_parts; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--



--
-- Data for Name: vector_indexes; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--



--
-- Name: refresh_tokens_id_seq; Type: SEQUENCE SET; Schema: auth; Owner: supabase_auth_admin
--

SELECT pg_catalog.setval('"auth"."refresh_tokens_id_seq"', 105, true);


--
-- Name: order_number_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('"public"."order_number_seq"', 1005, false);


--
-- PostgreSQL database dump complete
--

-- \unrestrict g8geTEyA1V6zDkwzHuQ6mN2kkwSFPPBbAI6VT2UhF1pVm4yvg1sQnOtjCejOfqZ

RESET ALL;
