# Certification criteria and proofs (10xDevs 4.0)

The official criteria were pasted by the owner on 2026-10-07 and are kept verbatim (Polish) in the appendix. This file gives the English summary, scores the project against each requirement with a proof a reviewer can check, and lists what the text does not say. It was written from the text below; it adds no criterion of its own. The submission form is not in the text (the course says it is shared by week 3 at the latest), so its link is not recorded here.

Status of the project as of 2026-10-07: **all five mandatory 10xBuilder requirements are met, and the optional public URL is live.**

## 1. The three pillars

| Pillar                  | What the text says                                                                              |
| ----------------------- | ----------------------------------------------------------------------------------------------- |
| 10xBuilder (mandatory)  | A successful full-stack MVP deployed to the cloud, done as the course project from modules 1-3. |
| 10xArchitect (optional) | Extending and modernising architecture and working with AI at larger scale (module 4).          |
| 10xChampion (optional)  | AI integrations in team work, among them CI/CD pipelines (module 5).                            |

The first text says Architect and Champion work starts after week 3 and that their full rules come in a separate message. That second message is stored below (section 1a and appendix B), but **it was cut off when pasted**, so what the Architect report and the Champion proof must contain is still unknown. `context/architect-report.md` and `context/champion-evidence.md` follow what was recorded elsewhere (see `context/certification-todo.md`) and are not yet checked against the official text.

## 1a. The extra badges: rules received so far

From the second message (appendix B), which says the two blocks are optional extra badges added to the certificate and that modules 4 and 5 are not needed for the base certificate with the 10xBuilder badge:

- The same three terms apply: up to 2026-11-04 (with a chance of a distinction), up to 2026-12-06, and up to 2027-01-10 (final).
- One term for the whole project. Whoever wants 10xArchitect or 10xChampion sends the 10xBuilder submission and the extra-badges submission (Architect and/or Champion) **in the same window**.
- The same rules as for 10xBuilder apply (the message links to them; the link was lost in the paste). Three matter most: everything in one round, one attempt in the chosen term (better to send closer to the end of the term, when you know which badges you apply for), and nothing added later (a November Builder-only submission cannot be topped up with Architect or Champion).
- **Cut off:** the message ends at "Dowodem jest raport architektoniczny, czyli z" ("The proof is an architecture report, that is…"). The rest of the Architect requirements and all of the Champion requirements are missing.

## 2. 10xBuilder: mandatory requirements and the proof for each

| Requirement (from the text)                                                                                          | Met | Proof in this repository                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| -------------------------------------------------------------------------------------------------------------------- | --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Access control:** access tied to a logged-in user who sees the resources assigned to them                          | Yes | Sign-in by emailed one-time link or password: `src/pages/auth/`, `src/pages/api/auth/`; every request resolves the user in `src/middleware.ts` and protected routes redirect to sign-in. Data belongs to a user: `day_notes.user_id` and `alert_rules.user_id` (default `auth.uid()`, unique per user) with row-level security, and the owner list `public.app_owners` gates the read-only data. This is a single-owner product, so "their resources" are the owner's. Tests: `tests/integration/access-abuse.test.ts` (19 `it` and `it.each` blocks against real Postgres: signed-out, anon and non-owner clients read and write nothing, each with a control), `src/middleware.test.ts`, and `tests/e2e/seed.spec.ts` (a signed-out visitor lands on sign-in). |
| **CRUD:** create, read, update and delete elements in a way that makes sense for the domain                          | Yes | Two entities. **Day notes:** add, view, edit and delete a note on any calendar day: `src/pages/api/notes.ts`, `src/lib/services/day-notes.ts`, `supabase/migrations/20261001072438_day_notes.sql`; tests `src/lib/services/day-notes.test.ts` and `tests/integration/notes-parity.test.ts`. **Alert rules:** create, list, edit, disable and delete: `src/pages/api/alert-rules.ts`, `src/lib/services/alert-rules.ts`, `supabase/migrations/20261007090000_alert_rules.sql`; browser test `tests/e2e/alert-rules.spec.ts` ("the owner creates, edits, disables and deletes a rule").                                                                                                                                                                            |
| **Business logic:** at least one function that implements logic (AI is not required)                                 | Yes | Several, all written down in `docs/logic.md` and tested next to the code: staleness verdicts (`src/lib/services/live-state.ts`), the season-adjusted usage baseline (`usage-insight.ts`), the bill forecast as a range (`bill-forecast.ts`), day and month ratings (`period-rating.ts`) and alert evaluation with throttling (`alert-evaluation.ts`), all in `src/lib/services/`.                                                                                                                                                                                                                                                                                                                                                                                |
| **Context documents:** for example `prd.md`, `infrastructure.md`, `roadmap.md`                                       | Yes | `context/foundation/`: `prd.md`, `prd-v2.md`, `prd-v3.md`, `infrastructure.md`, `roadmap.md`, `tech-stack.md`, `test-plan.md`, `test-stack.md`, `lessons.md`, `shape-notes.md`. Beyond these, 35 archived changes and 4 active ones in `context/archive/` and `context/changes/`, each with its research, plan and reviews.                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **Tests:** at least one suite for a concrete risk defined in the test plan, verifying behaviour from the user's side | Yes | `context/foundation/test-plan.md` ranks eight risks. Risk 6 (a non-owner or forged client gets in) is covered by `tests/integration/access-abuse.test.ts`; the other layers are `npm test` (unit and contract), `npm run test:integration` (real Postgres), `npm run smoke` (sign-in and push over HTTP against a built server) and `npm run test:e2e` (Playwright in a browser: the owner's alert-rules flow). CI requires `ci`, `smoke` and `integration` on `main` (`.github/rulesets/main-quality-gates.json`); `e2e` runs but is not required.                                                                                                                                                                                                              |

## 3. Optional (welcome, not required)

| Item                                                | Met | Proof                                                                                                                                                                                     |
| --------------------------------------------------- | --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public URL (or App Store or an installable package) | Yes | https://neil170-20170.mikrus.cloud answered 200 on `/api/health` on 2026-10-07, reporting release `9cd01719b3fd…`. Deploys go through `deploy-production.yml` with health-check rollback. |
| Public repository (not required, welcome)           | Yes | https://github.com/titusandronicu/energy-analyser (public).                                                                                                                               |

## 4. Dates and submission rules (from the text)

- Three terms, each counted until 23:59 of the day: **2026-11-04** (the only term with a chance of a distinction), **2026-12-06**, **2027-01-10** (final). After each term the reviewers have two weeks for checking and feedback.
- **One approach:** you sit the certification in one chosen term. Decide to submit closer to the end of the term, when you know which badges you apply for.
- **Everything in one round:** all badges you aim for go in the same term (not necessarily the same day).
- **Nothing added later:** if only Builder is submitted in November, the certificate has that one badge; Architect or Champion cannot be sent in December or January.
- All three badges can be earned even in the third term; the certificate is then the PRO version but without a distinction.
- The form is to be shared by week 3 of the programme at the latest.

## 5. Distinction criteria (from the text)

1. Submit in the first term (2026-11-04).
2. Either a custom version of 10xCards that meets all mandatory requirements **and** has a public URL, or a custom project that meets all mandatory requirements without a public URL (for example internal or corporate projects).

This project is a custom project (not a 10xCards variant). It meets all mandatory requirements and also has a public URL, so the only open condition for a distinction is the submission date.

## 6. Technical requirements and how submissions are judged (from the text)

- Any stack, web, desktop, mobile or embedded; what matters is using AI in the building process, not the app's complexity. The degree of AI use and the app's complexity are not assessed.
- A public repository is welcome, a private one is fine; without a repository the structure can be shown with screenshots of context files, tests and CI/CD configuration.
- An existing project may be certified if the link to the course material (skills, documentation, tests, CI/CD) is shown. This project follows the course workflow: shape, PRD, roadmap, then per change research, plan, implement, review and archive, all under `context/`; 256 of 271 human commits at the repo-map head are co-authored with an AI agent (`context/architect-report.md`).
- Review is done by a person assisted by AI, looking at real effort and understanding rather than a checklist. Questions go in the Discussions space with the instructors tagged.
- Advice from the text: keep the MVP small; avoid an empty CRUD (add a rule); avoid a high zero-to-one threshold; check the idea with `/10x-idea-check`.

## 7. What is not recorded

- The 10xBuilder submission form link (the link of the extra-badges form is in `context/certification-todo.md`).
- The rest of the 10xArchitect proof requirements and all of the 10xChampion requirements: the second message was cut off after "Dowodem jest raport architektoniczny, czyli z". Paste the remainder to complete this file.
- Any grading rubric beyond the text below.

## Appendix: source text (verbatim, Polish)

> W 10xDevs 4.0. Certyfikat opieramy o 3 filary wykorzystania AI. Fundamentem jest 1 blok obowiązkowy, a 2 kolejne są dla osób, które chcą pokazać więcej. Poniżej znajdziesz wszystko, czego potrzebujesz, żeby zaplanować swój projekt.
>
> **3 Filary Certyfikatu:**
>
> **10xBuilder (blok obowiązkowy)**
> Udana realizacja full-stackowego MVP z wdrożeniem na chmurę. To fundament certyfikacji - realizujesz go w ramach projektu zaliczeniowego, przerabiając lekcje z modułów 1-3.
>
> Projekt do tej odznaki musi zawierać:
>
> - Kontrola dostępu: dostęp do systemu powiązany z zalogowanym użytkownikiem, który widzi przypisane do siebie zasoby (na przykład ekran logowania).
> - CRUD: tworzenie, odczytywanie, aktualizacja i usuwanie elementów w sposób sensowny dla domeny aplikacji (na przykład dodaj, wylistuj, edytuj i usuń zadania na liście).
> - Logika biznesowa: przynajmniej 1 funkcja realizująca logikę (na przykład automatyczne sugerowanie priorytetów na podstawie nazwy, opisu i terminu). AI nie jest wymagane, OpenRouter to tylko jedna z opcji integracji.
> - Dokumenty kontekstowe: na przykład prd.md, infrastructure.md, roadmap.md.
> - Testy: co najmniej 1 zestaw testów adresujący konkretne ryzyko zdefiniowane w dokumencie test-plan, weryfikujący działanie z perspektywy użytkownika.
>
> Mile widziane (opcjonalnie):
>
> - Projekt dostępny pod publicznym URL, w App Store lub jako instalowalny pakiet. Jeśli typ aplikacji na to nie pozwala, pomiń ten punkt w opisie.
>
> **10xArchitect i 10xChampion (bloki dla chętnych)**
> Architect to rozbudowa i modernizacja architektury oraz praca z AI w większej skali (moduł 4). Champion to integracje AI w pracy zespołowej, między innymi pipeline'y CI/CD (moduł 5).
>
> Nad tymi blokami zaczynasz pracować dopiero po 3. tygodniu programu, dlatego na ten moment traktujemy je jako zapowiedź. Pełne zasady dla Architecta oraz Championa przedstawimy osobnym komunikatem w dalszej części programu.
>
> **Daty Certyfikacji:**
>
> - Termin 1: 4 listopada 2026 - jedyny termin z szansą na wyróżnienie
> - Termin 2: 6 grudnia 2026
> - Termin 3: 10 stycznia 2027 → termin ostateczny!
>
> Każdy termin liczy się do godziny 23:59 wskazanego dnia. Po każdym terminie prowadzący mają 2 tygodnie na sprawdzenie i feedback.
>
> **Zasady zgłoszeń - przemyśl strategię**
>
> Moment wysłania projektu ma znaczenie, dlatego warto go dobrze zaplanować.
>
> - Jedno podejście: do certyfikacji podchodzisz w jednym wybranym terminie. Decyzję o wysłaniu warto podjąć bliżej końca terminu, kiedy dokładnie wiesz, na jakie odznaki się zgłaszasz.
> - Wszystko w jednej turze: jeśli celujesz w więcej niż jedną odznakę, zgłaszasz je w ramach tego samego terminu (nie muszą być tego samego dnia).
> - Bez dorzucania później: jeśli w listopadzie zgłosisz sam blok Builder, dostaniesz certyfikat z tą jedną odznaką. Nie dosłać już zadań na Architecta czy Championa w grudniu ani styczniu.
>
> Wyróżnienie zdobywasz, wysyłając wybrany zakres w 1. terminie (4 listopada). Wszystkie 3 odznaki możesz uzyskać nawet w 3. terminie - certyfikat nie będzie miał wtedy wyróżnienia, ale nadal jest w wersji PRO.
>
> Formularz do złożenia projektu udostępnimy najpóźniej w 3 tygodniu programu.
>
> **Kryteria na wyróżnienie:**
>
> - Złożenie projektu w 1. terminie (4 listopada),
> - Własna wersja 10xCards - spełnienie wszystkich wymagań obowiązkowych oraz publiczny URL.
> - Projekt customowy - spełnienie wszystkich wymagań obowiązkowych, bez publicznego URL (na przykład projekty wewnętrzne czy korporacyjne).
>
> **Wymogi techniczne:**
>
> - Stack dowolny - aplikacja webowa, desktopowa, mobilna lub embedded. Nie musi być JavaScript ani web.
> - Kluczowe jest zastosowanie AI w procesie wytwarzania, a nie złożoność aplikacji.
> - Repozytorium publiczne nie jest wymagane, ale mile widziane. Repo prywatne również jest w porządku. Jeśli nie chcesz udostępniać repozytorium, projekt możesz udokumentować screenshotami pokazującymi strukturę: pliki kontekstowe, testy i konfigurację CI/CD.
>
> **Projekty niewebowe i rozbudowa istniejących**
>
> Jeśli Twój projekt jest desktopowy, mobilny, embedded lub w innym stacku - dostosujemy kryteria oceny. Nie wymagamy publicznego URL od aplikacji desktopowych ani przechodzenia przez płatną certyfikację App Store. Liczy się zachowanie przepływu projektowego, czyli dokumentacji, testów i automatyzacji.
>
> Możesz też certyfikować się na podstawie projektu, nad którym już pracujesz, o ile pokażesz połączenie między materiałem kursowym (skille, dokumentacja, testy, CI/CD) a tym, co zrobiłeś. Ta ścieżka nie jest odwzorowaniem lekcji 1:1, ale nasze skille do planowania i implementacji są uniwersalne.
>
> W razie wątpliwości opisz swój przypadek w przestrzeni Dyskusje / Praktyka i oznacz prowadzących.
>
> **Jak oceniamy zgłoszenia**
>
> Weryfikację prowadzi człowiek wspomagany AI, nie automat. Zależy nam na ocenie rzeczywistego wysiłku i zrozumienia materiału, a nie na samym odhaczeniu checklisty.
>
> **Jaki projekt wybrać? Dobry projekt jest mniejszy, niż myślisz**
>
> Najważniejsze słowo to MVP - najmniejsza wersja produktu, która nadal daje użytkownikowi konkretną wartość.
>
> Prosta reguła: jeśli pierwszy działający przepływ wymaga więcej niż tygodnia pracy po godzinach, zmniejsz MVP. To sygnał ostrzegawczy - przy kilku tygodniach na samo dojście do czegoś działającego zabraknie Ci czasu na dokumentację, testy, CI/CD i poprawki po feedbacku.
>
> Najlepiej przyjmowane projekty na poprzednich Demo Days łączyło to, że były realne dla twórcy: narzędzie dla znajomych albo usprawnienie własnej pracy. Nie chodzi o podbijanie świata, chodzi o zajawkę i kontekst.
>
> Czego unikać:
>
> - Za duże MVP - "aplikacja do zarządzania finansami", która po chwili ma import z banku, skanowanie paragonów, wykresy, budżety i coacha AI. Każda funkcja osobno sensowna, razem to już projekt startupowy.
> - Pusty CRUD - sama lista zadań czy książek to dobry fundament, ale dodaj do niej regułę: rekomendację, priorytetyzację, walidację albo scoring.
> - Wysoki próg zero-to-one - tydzień pracy, a wciąż nie da się wykonać jednej sensownej akcji w aplikacji.
>
> Zanim zaczniesz kodować, sprawdź swój pomysł na projekt skilla /10x-idea-check - szczegóły znajdziesz w pierwszej lekcji 10xDevs 4.0.
>
> **Warto wiedzieć**
>
> - Przygotowania techniczne startują w module 1, a właściwą pracę nad projektem zaczynamy od modułu 2 - tam pokazujemy workflow implementacji funkcjonalności.
> - Nie stresuj się tempem - masz 3 terminy.
> - Jakość artefaktów projektowych (PRD, specyfikacje) jest kluczem do dobrej pracy z AI.
> - Nie weryfikujemy stopnia wykorzystania AI - projekt robisz dla siebie.
> - Nie oceniamy złożoności aplikacji - liczy się zrealizowanie wymogów.
>
> **Rekomendowane narzędzia:**
>
> - Ekosystem VS Code: Cursor, lub bazowe VS Code z agentem w terminalu.
> - Ekosystem JetBrains: Claude Code w terminalu lub pluginy open-source.
> - Niezależnie od IDE: Claude Code lub Codex CLI jako domyślne narzędzie.
>
> Powodzenia w dalszym programowaniu z AI. W razie pytań piszcie w komentarzach.

## Appendix B: source text of the second message (verbatim, Polish; cut off where it was pasted)

> Cześć 👋
> poniżej zasady dotyczące dodatkowych bloków 10xArchitect i 10xChampion. Każdy z nich to dodatkowa odznaka, którą możesz dodać do swojego Certyfikatu.
>
> To ścieżki dla chętnych. Moduły 4 i 5 nie są wymagane do zdobycia bazowego Certyfikatu z odznaką 10xBuilder.
>
> **Kiedy wysłać projekt?**
>
> Masz do wyboru 3 terminy:
>
> - do 4 listopada 2026 - z szansą na wyróżnienie,
> - do 6 grudnia 2026,
> - do 10 stycznia 2027 → termin ostateczny!
>
> Wybierasz jeden termin dla całego projektu. Jeśli chcesz zdobyć 10xArchitect lub 10xChampion - zgłoszenie do 10xBuilder'a i zgłoszenie do odznak dodatkowych (Architect i/lub Champion) wysyłasz w tym samym oknie.
>
> **Zasady zgłoszeń - przemyśl swoją strategię**
>
> Obowiązują te same reguły co przy 10xBuilder (M1-3). Znajdziesz je tutaj: [the link was not in the paste] Przy odznakach dla chętnych szczególnie ważne jest:
>
> - Wszystko w jednej turze. Projekt przesyłasz w całości, w jednym terminie. Jeśli oprócz 10xBuilder chcesz zdobyć 10xArchitect, 10xChampion lub obie odznaki, wyślij formularz 10xBuildera i formularz bloków dodatkowych w tym samym oknie.
> - Tylko jedno podejście. Do certyfikacji podchodzisz raz, w wybranym terminie. Warto wysłać projekt bliżej końca terminu, gdy wiesz już dokładnie, na jakie odznaki się zgłaszasz.
> - Bez dorzucania zadań. Jeśli w listopadzie zgłosisz tylko blok Builder, dostaniesz certyfikat z tą jedną odznaką. W kolejnym terminie nie uzupełnisz go już o Architect ani Champion.
>
> **Co przygotować - 10xArchitect (moduł 4)**
>
> Dowodem jest raport architektoniczny, czyli z

[The message is cut off here in the paste; everything after this point is missing.]
