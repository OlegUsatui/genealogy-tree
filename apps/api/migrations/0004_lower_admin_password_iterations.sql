UPDATE users
SET password_hash = 'pbkdf2$100000$family-tree-admin-salt$iJu3Xh_xX5Zg2D1wCcV9d6_Z6imdCU3NW2R8SdcSn5g'
WHERE email = 'admin@example.com';
