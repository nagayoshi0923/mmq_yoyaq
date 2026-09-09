-- 隔離DBのみ。通知先をテスト組織に与える。
CREATE FUNCTION test_org_settings() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN INSERT INTO organization_settings VALUES(NEW.id,'123456789012345678') ON CONFLICT DO NOTHING; RETURN NEW; END $$;
CREATE TRIGGER test_org_settings AFTER INSERT ON organizations FOR EACH ROW EXECUTE FUNCTION test_org_settings();
