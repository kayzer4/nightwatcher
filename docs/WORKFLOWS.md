# Рабочие сценарии для агентов

## Сначала найти точку изменения

- Внешний вид и управление главной сценой: `src/widgets/city-viewer/ui/CityViewerClient.tsx`; искать компонент/символ через `rg -n`, читать нужный диапазон строк.
- Правила генерации дорог, зданий и маршрутов NPC: `src/shared/engine/CityGenerator.ts`.
- Расстановка и затенение фонарей: `src/widgets/city-viewer/lib/lamp-placement.ts` и код `applyPlacement` в `CityViewerClient.tsx`.
- Физика NPC: `src/widgets/city-viewer/lib/ragdoll.ts`, регистрация геометрии: `city-colliders.ts`.
- Поля редактора: `src/app/editor/constants.ts`, конкретная панель `src/app/editor/panels/`, состояние/сохранение `src/app/editor/page.tsx`.
- Новые GLB: `public/models/<pack>/` и конфигурация в `src/shared/config/model-configs.json`; проверьте список пакетов в `/api/models`.

## Проверка изменений

- Менеджер пакетов заявлен как Bun 1.4 (`bun.lock`). Скрипты: `bun run dev`, `bun run lint`, `bun run build`. При отсутствии Bun эквивалентные npm scripts доступны через установленный `node_modules`; не меняйте lock-файлы ради проверки.
- Для TypeScript: `./node_modules/.bin/tsc --noEmit`. Для небольших правок запускайте только относящуюся к ним проверку; сборка нужна при изменениях маршрутов, API или границ Server/Client Components.
- Для поведения WebGL/NPC одной компиляции мало: при необходимости проверяйте `/` и `/editor` в браузере, ошибки консоли и работу сохранения/перезагрузки.
- Перед правкой Next.js API прочтите нужную страницу из `node_modules/next/dist/docs/01-app/`; для маршрутов подходят `01-getting-started/03-layouts-and-pages.md`, для клиентского кода — `01-getting-started/05-server-and-client-components.md`.

## Осторожность с данными

- POST `/api/model-configs` перезаписывает JSON целиком. Сохраняйте существующие ключи конфигурации при ручном редактировании.
- Редактор сохраняет изменения автоматически через 500 мс; при ручной проверке он может изменить отслеживаемый `model-configs.json`. После проверки смотрите `git diff`.
- Не трогайте незакоммиченные пользовательские файлы и бинарные модели без прямой задачи. Перед завершением проверяйте `git status --short`.
