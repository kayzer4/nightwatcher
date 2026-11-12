<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Nightwatcher: быстрый вход

Это прототип ночного 3D-города на Next.js 16, React 19, React Three Fiber, Three.js, Ant Design и Rapier. Главные маршруты: `/` (генерируемая сцена) и `/editor` (редактор метаданных GLB). Подробности по запросу: [архитектура](docs/ARCHITECTURE.md), [порядок работы](docs/WORKFLOWS.md). Читайте только нужный раздел и исходники затрагиваемой функции: большие файлы сцены и генератора не стоит целиком помещать в контекст.

- Главный путь сцены: `src/app/page.tsx` → `src/widgets/city-viewer/ui/CityViewer.tsx` → `CityViewerClient.tsx`. Оркестратор подключает `NPCSystem.tsx`, `CityModels.tsx`, `EnvironmentSystem.tsx`, `GameSessionSystem.tsx`, `CityCameraControls.tsx`, `LampOutlineEffect.tsx` и `WorldBackdrop.tsx` из того же каталога. Фон строится тем же `CityGenerator` через `lib/BackdropCityPlan.ts`; один ряд зданий отделяет игровые улицы от фона. Геометрия LOD готовится в `lib/BackdropLODGeometry.ts` с сохранением UV. Правила смены, времени и событий окон — в `src/shared/game-core/`.
- Главный путь редактора: `src/app/editor/page.tsx` → `src/app/editor/SceneSection.tsx` и панели в `src/app/editor/panels/`.
- Метаданные моделей: `src/shared/config/model-configs.json`; GLB: `public/models/<pack>/*.glb`. Ключ конфигурации — `<pack>/<model>`.
- Перед изменением Next.js API читайте соответствующий раздел **локальной** документации `node_modules/next/dist/docs/`, как требует блок выше.
- Не перезаписывайте чужие незакоммиченные изменения; проверяйте `git status --short` до правок.
