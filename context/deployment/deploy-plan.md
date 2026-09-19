# Pierwsze wdrożenie Energy Analyser na Micr.us

## Cel i zakres

Wdrożyć publicznie aktualny starter Astro z jednoosobowym logowaniem jako kontener Node.js 22 na Micr.us. Obraz buduje GitHub Actions i publikuje do publicznego GHCR. Pierwszy release potwierdza wyłącznie tor GitHub → GHCR → Micr.us → HTTPS → Supabase Auth; integracje Home Assistant, Deye, scheduler i LLM pozostają poza zakresem.

- Repozytorium: `titusandronicu/energy-analyser` (publiczne).
- Obraz: `ghcr.io/titusandronicu/energy-analyser:sha-<pełny-commit>` (publiczny).
- VPS: `root@neil170.mikrus.xyz`, SSH `10170`; po bootstrapie wdrożenia wykonuje użytkownik `deploy`.
- Publiczny adres: `https://neil170-20170.mikrus.cloud`.
- Serwer: HTTP na dedykowanym adresie IPv6 `[2a01:4f9:6b:4f6b::170]:20170`; TLS kończy proxy Mikrusa, bez Caddy. Konkretny adres IPv6 jest wymagany, ponieważ zarządzany przez Mikrusa proces `rathole` zajmuje wariant IPv4 tego samego portu, a kernel ma wyłączone `bindv6only`.

## Zmiany w repozytorium

1. Zastąpić `@astrojs/cloudflare` i Wrangler adapterem `@astrojs/node` w trybie `standalone`; usunąć `wrangler.jsonc` i zaktualizować dokumentację. Podczas implementacji rejestr npm wykazał, że seria 10.x obsługuje Astro 6, dlatego dla obecnego Astro 7 należy użyć zgodnej serii 11.x.
2. Produkcję uruchamiać jako `HOST=:: PORT=20170 node ./dist/server/entry.mjs`.
3. Dodać wieloetapowy `Dockerfile` oparty na `node:22-bookworm-slim`, uruchamiany bez roota, `.dockerignore` oraz Compose z `network_mode: host`, `restart: unless-stopped`, tylko-do-odczytu systemem plików, `tmpfs`, usuniętymi capabilities, `no-new-privileges`, limitem 384 MB i rotacją logów. Obraz wskazuje `release.env`, a sekrety znajdują się w niecommitowanym `.env.runtime`.
4. Dodać `GET /api/health`, zwracający tylko `status`, `version` i czas odpowiedzi.
5. Ujednolicić zmienne do `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `ALLOW_SIGNUP`, `APP_VERSION`. Nie dopuszczać klucza `service_role`.
6. Domyślnie wyłączyć publiczną rejestrację. Strona i endpoint signup działają tylko z `ALLOW_SIGNUP=true`; produkcja używa `false`.
7. Poprawić CI z `master` na `main`, zachowując lint, Astro check, build oraz smoke z lokalnym Supabase i włączonym signupem.
8. Dodać publikację obrazu po udanym pushu do `main`, przez `GITHUB_TOKEN`, z minimalnymi uprawnieniami, niezmiennym tagiem SHA i provenance. Zewnętrzne akcje przypiąć do pełnych commit SHA.
9. Dodać ręczny workflow wdrożenia przyjmujący pełny SHA, ze środowiskiem `production` i blokadą concurrency. Workflow przesyła Compose, zachowuje poprzedni `release.env`, wdraża nowy obraz, sprawdza health i automatycznie przywraca poprzedni tag po niepowodzeniu.

## Bramka infrastrukturalna

Przed wdrożeniem operator:

- loguje się pierwszy raz jako root i instaluje oddzielne klucze administracyjny oraz deploy;
- potwierdza Debian/Ubuntu, minimum 512 MB RAM, 1 GB wolnego dysku oraz przydział portu `20170`;
- instaluje/weryfikuje Docker Engine z Compose, tworzy `deploy` i `/opt/energy-analyser`;
- tworzy `.env.runtime` z `SUPABASE_URL`, anon key, `ALLOW_SIGNUP=false` i wersją aplikacji;
- wyłącza signup w Supabase, tworzy konto właściciela i ustawia Site URL;
- opcjonalnie przygotowuje Tailscale dopiero po wdrożeniu ACL ograniczającego dostęp do HA `8123` i Ollama `11434`.

Jeżeli system, zasoby lub przydział portu nie spełniają wymagań, wdrożenie zostaje zatrzymane zamiast samodzielnej zmiany założeń.

## Weryfikacja i rollback

Przed publikacją: skan sekretów, `npm run lint`, `npx astro check`, `npm run build`, smoke z lokalnym Supabase oraz lokalny test obrazu Docker.

Po wdrożeniu sprawdzić health z oczekiwanym SHA, stronę główną przez HTTPS, przekierowanie anonimowego `/dashboard`, niedostępny signup, ręczne logowanie/wylogowanie konta właściciela, stan po restarcie oraz brak sekretów w logach. Publiczny health monitoruje Uptime Kuma. Produkcyjny smoke nie tworzy użytkownika.

Każde wdrożenie zachowuje poprzedni `release.env`. Rollback przywraca poprzedni niezmienny tag SHA i wykonuje `docker compose up -d`; cel operacyjny to mniej niż pięć minut. W tym wydaniu nie ma migracji bazy danych.
