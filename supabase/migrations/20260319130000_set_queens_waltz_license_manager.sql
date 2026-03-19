-- クインズワルツをライセンス管理者に設定
UPDATE organizations
SET is_license_manager = true
WHERE slug = 'queens-waltz';
