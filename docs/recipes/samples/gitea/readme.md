# Gitea / Forgejo sample

Run: `docker run -d -p 3999:3000 -e GITEA__security__INSTALL_LOCK=true -v <this folder>/custom/templates:/data/gitea/templates:ro gitea/gitea`
Then `docker exec -u git <container> gitea admin user create --username sample --password Sample-pass-123 --email sample@example.invalid --admin` and `node setup.mjs http://127.0.0.1:3999 sample Sample-pass-123`
Check: `node docs/recipes/samples/check.mjs http://127.0.0.1:3999 /sample/charts /sample/charts/issues/1` — Recipe: [../../gitea.md](../../gitea.md)
