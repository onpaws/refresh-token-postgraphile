CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;
CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA public;

CREATE SCHEMA demo_public;
CREATE SCHEMA demo_private;

ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM public;

CREATE TABLE demo_public.person (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v1mc(),
  first_name  TEXT NOT NULL CHECK (char_length(first_name) < 80),
  last_name   TEXT CHECK (char_length(last_name) < 80),
  about       TEXT,
  created_at  TIMESTAMP DEFAULT now()
);
ALTER TABLE demo_public.person ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE demo_public.person IS 'A human user of the app';
COMMENT ON COLUMN demo_public.person.id is 'The primary unique identifier for the person.';
COMMENT ON COLUMN demo_public.person.first_name is 'The person’s first name.';
COMMENT ON COLUMN demo_public.person.last_name is 'The person’s last name.';
COMMENT ON COLUMN demo_public.person.about is 'A short description about the user, written by the user.';
COMMENT ON COLUMN demo_public.person.created_at is 'The time this person was created.';

CREATE TABLE demo_private.person_account (
  person_id        UUID PRIMARY KEY REFERENCES demo_public.person(id) ON DELETE CASCADE,
  email            TEXT NOT NULL unique CHECK (email ~* '^.+@.+\..+$'),
  password_hash    TEXT NOT NULL
);
ALTER TABLE demo_private.person_account ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE demo_private.person_account is 'Private information about a person’s account';
COMMENT ON COLUMN demo_private.person_account.person_id is 'The id of the person associated with this account';
COMMENT ON COLUMN demo_private.person_account.email is 'The email address of the person';
COMMENT ON COLUMN demo_private.person_account.password_hash is 'An opaque hash of the person’s password';

CREATE TABLE demo_public.todo (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v1mc(),
  todo        TEXT NOT NULL,
  completed   TIMESTAMP,
  person_id   UUID NOT NULL DEFAULT (demo_public.current_person()).id REFERENCES demo_public.person(id)
);
CREATE INDEX ON demo_public.todo(person_id);
ALTER TABLE demo_public.todo ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE demo_public.todo is '@omit personId';

CREATE OR REPLACE FUNCTION demo_public.register_person(
  first_name TEXT,
  last_name TEXT,
  email CITEXT,
  password TEXT
) RETURNS demo_public.person as $$
DECLARE
  person demo_public.person;
BEGIN
  INSERT INTO demo_public.person (first_name, last_name) VALUES
    (first_name, last_name)
    RETURNING * into person;

  INSERT INTO demo_private.person_account (person_id, email, password_hash) VALUES
    (person.id, email, crypt(password, gen_salt('bf', 9)));

  RETURN person;
END;
$$ LANGUAGE plpgsql strict SECURITY DEFINER;
COMMENT ON FUNCTION demo_public.register_person(TEXT, TEXT, CITEXT, TEXT) IS 'Registers a single user and creates an account.';

CREATE ROLE demo_postgraphile LOGIN PASSWORD '09$6k3eVq2vnJoOaIaIWh' NOINHERIT;
COMMENT ON ROLE demo_postgraphile IS 'Intended for Postgraphile to log itself into Postgres with (hence why LOGIN option)';

CREATE ROLE demo_anonymous;
GRANT demo_anonymous TO demo_postgraphile; -- critical, intended for pgDefaultRole PostGraphile setting
COMMENT ON ROLE demo_anonymous IS 'Intended for unauthenticated/public users. demo_postgraphile can control and become demo_anonymous';

CREATE ROLE demo_authenticated;
GRANT demo_authenticated TO demo_postgraphile; -- logged in users switch to this role
COMMENT ON ROLE demo_authenticated IS 'Intended for users that logged in. demo_postgraphile becomes demo_authenticated';

CREATE TYPE demo_public.jwt_token AS (
  role TEXT,
  sub UUID,
  exp BIGINT
);
COMMENT ON TYPE demo_public.jwt_token IS 'The JWT type PgJWTPlugin will sign when PostGraphile encounters it. sub means user id. Also used by generate_token_plaintext()';

-- Now we need a function to actually return the token:
CREATE FUNCTION demo_private.generate_token_plaintext(
  email TEXT,
  password TEXT
) RETURNS demo_public.jwt_token AS $$
DECLARE
  account demo_private.person_account;
BEGIN
  SELECT a.* INTO account
  FROM demo_private.person_account as a
  WHERE a.email = $1;

  IF account.password_hash = crypt(password, account.password_hash) THEN
    RETURN('demo_authenticated', account.person_id, extract(epoch from (now() + interval '2 days')))::demo_public.jwt_token;
  ELSE
    RETURN NULL;
  END IF;
END;
$$ LANGUAGE plpgsql STRICT SECURITY DEFINER;
COMMENT ON FUNCTION demo_private.generate_token_plaintext IS '@omit\nModified version of authenticate() as seen in the docs.\n\nDeliberately excluded from GQL and public schema. To login please call authenticate() as defined in `refreshTokenPlugin`.';

CREATE OR REPLACE FUNCTION demo_public.current_person() RETURNS demo_public.person as $$
  SELECT * 
  FROM demo_public.person
  WHERE id = NULLIF(current_setting('jwt.claims.sub', true), '')::UUID
$$ LANGUAGE sql STABLE;
COMMENT ON FUNCTION demo_public.current_person() is 'Gets the person who was identified by our JWT';


GRANT USAGE ON SCHEMA demo_public TO demo_anonymous, demo_authenticated;
-- allows anonymous and auth'd users to know the schema exists
-- note we did not grant usage to the private schema

GRANT SELECT ON TABLE demo_public.person TO demo_anonymous, demo_authenticated;
-- anon and auth'd users can read all the rows in the person table

GRANT UPDATE, DELETE ON TABLE demo_public.person TO demo_authenticated;
-- only logged in users can modify the person table. NOTE still needs to be locked down with RLS

GRANT SELECT ON TABLE demo_public.todo TO demo_authenticated;
-- auth'd users can read all the rows in the todos table
GRANT INSERT, UPDATE, DELETE ON TABLE demo_public.todo TO demo_authenticated;
-- only logged in users can modify the posts table. NOTE still needs to be locked down with RLS

-- GRANT USAGE ON SEQUENCE demo_public.post_id_seq TO demo_authenticated; --only useful for int primary keys
-- when a user makes a new post, they need to know the next item in sequence b/c we use SERIAL data type for id col

-- GRANT EXECUTE ON FUNCTION demo_public.authenticate(text, text) TO demo_anonymous, demo_authenticated;
GRANT EXECUTE ON FUNCTION demo_public.current_person() TO demo_anonymous, demo_authenticated;
-- must whitelist all functions b/c we revoked function execution perms up top

GRANT EXECUTE ON FUNCTION demo_public.register_person(text, text, citext, text) TO demo_anonymous;
-- only anon users should need to logon

GRANT EXECUTE ON FUNCTION uuid_generate_v1mc TO demo_authenticated;
-- tables with UUIDs require extra perm to make next record

-- NOW, it's time to use RLS!
CREATE POLICY select_person ON demo_public.person FOR SELECT USING (true);
CREATE POLICY select_todo ON demo_public.todo FOR SELECT USING (true);
-- both anon and auth's users can see all rows again

CREATE POLICY update_person ON demo_public.person FOR UPDATE TO demo_authenticated
  USING (id = nullif(current_setting('jwt.claims.sub', true), '')::UUID);
CREATE POLICY delete_person on demo_public.person FOR DELETE TO demo_authenticated
  USING (id = nullif(current_setting('jwt.claims.sub', true), '')::UUID);
-- only when person_id matches the row's ID will they be allowed to edit/delete their person record

CREATE POLICY insert_todo ON demo_public.todo FOR INSERT TO demo_authenticated
  WITH CHECK (person_id = nullif(current_setting('jwt.claims.sub', true), '')::UUID);

CREATE POLICY update_todo ON demo_public.todo FOR UPDATE TO demo_authenticated
  USING (person_id = nullif(current_setting('jwt.claims.sub', true), '')::UUID);

CREATE POLICY delete_todo ON demo_public.todo FOR DELETE TO demo_authenticated
  USING (person_id = nullif(current_setting('jwt.claims.sub', true), '')::UUID);
-- logged in users can edit their own posts only

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE demo_public.todo TO demo_authenticated;
-- only logged in users can edit todos