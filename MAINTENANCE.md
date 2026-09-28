# Maintenance Log

This file is appended to automatically by `.github/workflows/automated-maintenance.yml`,
a scheduled job that runs real upkeep checks against `main`: eslint autofix,
an `npm outdated` freshness report, and a typecheck/test status check. It
commits only when one of those checks actually produces a change — no
change, no commit. It never touches feature/working branches.

### 2026-09-11 — dependency freshness
```
Package                        Current   Wanted   Latest  Location                                    Depended by
@anthropic-ai/sdk               0.30.1   0.30.1  0.125.0  node_modules/@anthropic-ai/sdk              Foundry
@clerk/nextjs                   6.39.6   6.39.6    7.9.2  node_modules/@clerk/nextjs                  Foundry
@hookform/resolvers             3.10.0   3.10.0    5.9.1  node_modules/@hookform/resolvers            Foundry
@playwright/test                1.61.1   1.63.0   1.63.0  node_modules/@playwright/test               Foundry
@prisma/client                  6.19.3   6.19.3   7.10.0  node_modules/@prisma/client                 Foundry
@radix-ui/react-dialog          1.1.20   1.1.23   1.1.23  node_modules/@radix-ui/react-dialog         Foundry
@radix-ui/react-dropdown-menu   2.1.21   2.1.24   2.1.24  node_modules/@radix-ui/react-dropdown-menu  Foundry
@radix-ui/react-popover         1.1.20   1.1.23   1.1.23  node_modules/@radix-ui/react-popover        Foundry
@radix-ui/react-select           2.3.4    2.3.7    2.3.7  node_modules/@radix-ui/react-select         Foundry
@radix-ui/react-tabs            1.1.18   1.1.21   1.1.21  node_modules/@radix-ui/react-tabs           Foundry
@radix-ui/react-toast           1.2.20   1.2.23   1.2.23  node_modules/@radix-ui/react-toast          Foundry
@react-pdf/renderer              4.5.1    4.9.0    4.9.0  node_modules/@react-pdf/renderer            Foundry
@tanstack/react-query          5.101.4  5.102.8  5.102.8  node_modules/@tanstack/react-query          Foundry
@tanstack/react-table           8.21.3   8.21.3    9.2.4  node_modules/@tanstack/react-table          Foundry
@types/node                    22.20.1  22.20.2  22.20.2  node_modules/@types/node                    Foundry
@types/react                   19.2.17   19.3.0   19.3.0  node_modules/@types/react                   Foundry
@upstash/redis                  1.38.0   1.38.4   1.38.4  node_modules/@upstash/redis                 Foundry
autoprefixer                    10.5.4   10.5.6   10.5.6  node_modules/autoprefixer                   Foundry
eslint                          9.39.5   9.39.5  10.10.0  node_modules/eslint                         Foundry
eslint-config-next             15.5.21  15.5.25   16.3.4  node_modules/eslint-config-next             Foundry
framer-motion                  11.18.2  11.18.2   13.2.0  node_modules/framer-motion                  Foundry
lucide-react                   0.468.0  0.468.0   1.45.0  node_modules/lucide-react                   Foundry
next                           15.5.21  15.5.25   16.3.4  node_modules/next                           Foundry
openai                         4.104.0  4.104.0   6.49.0  node_modules/openai                         Foundry
postcss                         8.5.22   8.5.28   8.5.28  node_modules/postcss                        Foundry
prisma                          6.19.3   6.19.3   7.10.0  node_modules/prisma                         Foundry
react                           19.2.8   19.3.0   19.3.0  node_modules/react                          Foundry
react-dom                       19.2.8   19.3.0   19.3.0  node_modules/react-dom                      Foundry
react-hook-form                 7.82.0   7.87.0   7.87.0  node_modules/react-hook-form                Foundry
recharts                        2.15.4   2.15.4   3.10.1  node_modules/recharts                       Foundry
resend                           4.8.0    4.8.0   6.27.0  node_modules/resend                         Foundry
stripe                          17.7.0   17.7.0   22.6.2  node_modules/stripe                         Foundry
svix                            1.98.0   1.99.1   1.99.1  node_modules/svix                           Foundry
tailwind-merge                   2.6.1    2.6.1    3.6.0  node_modules/tailwind-merge                 Foundry
tailwindcss                     3.4.19   3.4.19    4.3.3  node_modules/tailwindcss                    Foundry
tsx                             4.23.1  4.23.13  4.23.13  node_modules/tsx                            Foundry
typescript                       5.9.3    5.9.3    7.0.2  node_modules/typescript                     Foundry
vitest                           2.1.9    2.1.9   4.1.11  node_modules/vitest                         Foundry
zod                            3.25.76  3.25.76    4.6.2  node_modules/zod                            Foundry
```

### 2026-09-11 — typecheck/test status: pass

### 2026-09-11 — dependency freshness
```
Package                        Current   Wanted   Latest  Location                                    Depended by
@anthropic-ai/sdk               0.30.1   0.30.1  0.125.0  node_modules/@anthropic-ai/sdk              Foundry
@clerk/nextjs                   6.39.6   6.39.6    7.9.2  node_modules/@clerk/nextjs                  Foundry
@hookform/resolvers             3.10.0   3.10.0    5.9.1  node_modules/@hookform/resolvers            Foundry
@playwright/test                1.61.1   1.63.0   1.63.0  node_modules/@playwright/test               Foundry
@prisma/client                  6.19.3   6.19.3   7.10.0  node_modules/@prisma/client                 Foundry
@radix-ui/react-dialog          1.1.20   1.1.23   1.1.23  node_modules/@radix-ui/react-dialog         Foundry
@radix-ui/react-dropdown-menu   2.1.21   2.1.24   2.1.24  node_modules/@radix-ui/react-dropdown-menu  Foundry
@radix-ui/react-popover         1.1.20   1.1.23   1.1.23  node_modules/@radix-ui/react-popover        Foundry
@radix-ui/react-select           2.3.4    2.3.7    2.3.7  node_modules/@radix-ui/react-select         Foundry
@radix-ui/react-tabs            1.1.18   1.1.21   1.1.21  node_modules/@radix-ui/react-tabs           Foundry
@radix-ui/react-toast           1.2.20   1.2.23   1.2.23  node_modules/@radix-ui/react-toast          Foundry
@react-pdf/renderer              4.5.1    4.9.0    4.9.0  node_modules/@react-pdf/renderer            Foundry
@tanstack/react-query          5.101.4  5.102.8  5.102.8  node_modules/@tanstack/react-query          Foundry
@tanstack/react-table           8.21.3   8.21.3    9.2.4  node_modules/@tanstack/react-table          Foundry
@types/node                    22.20.1  22.20.2  22.20.2  node_modules/@types/node                    Foundry
@types/react                   19.2.17   19.3.0   19.3.0  node_modules/@types/react                   Foundry
@upstash/redis                  1.38.0   1.38.4   1.38.4  node_modules/@upstash/redis                 Foundry
autoprefixer                    10.5.4   10.5.6   10.5.6  node_modules/autoprefixer                   Foundry
eslint                          9.39.5   9.39.5  10.10.0  node_modules/eslint                         Foundry
eslint-config-next             15.5.21  15.5.25   16.3.5  node_modules/eslint-config-next             Foundry
framer-motion                  11.18.2  11.18.2   13.2.0  node_modules/framer-motion                  Foundry
lucide-react                   0.468.0  0.468.0   1.45.0  node_modules/lucide-react                   Foundry
next                           15.5.21  15.5.25   16.3.5  node_modules/next                           Foundry
openai                         4.104.0  4.104.0   6.49.0  node_modules/openai                         Foundry
postcss                         8.5.22   8.5.28   8.5.28  node_modules/postcss                        Foundry
prisma                          6.19.3   6.19.3   7.10.0  node_modules/prisma                         Foundry
react                           19.2.8   19.3.0   19.3.0  node_modules/react                          Foundry
react-dom                       19.2.8   19.3.0   19.3.0  node_modules/react-dom                      Foundry
react-hook-form                 7.82.0   7.87.0   7.87.0  node_modules/react-hook-form                Foundry
recharts                        2.15.4   2.15.4   3.10.1  node_modules/recharts                       Foundry
resend                           4.8.0    4.8.0   6.27.0  node_modules/resend                         Foundry
stripe                          17.7.0   17.7.0   22.6.2  node_modules/stripe                         Foundry
svix                            1.98.0   1.99.1   1.99.1  node_modules/svix                           Foundry
tailwind-merge                   2.6.1    2.6.1    3.6.0  node_modules/tailwind-merge                 Foundry
tailwindcss                     3.4.19   3.4.19    4.3.3  node_modules/tailwindcss                    Foundry
tsx                             4.23.1  4.23.13  4.23.13  node_modules/tsx                            Foundry
typescript                       5.9.3    5.9.3    7.0.2  node_modules/typescript                     Foundry
vitest                           2.1.9    2.1.9   4.1.11  node_modules/vitest                         Foundry
zod                            3.25.76  3.25.76    4.6.2  node_modules/zod                            Foundry
```

### 2026-09-11 — typecheck/test status: pass

### 2026-09-14 — dependency freshness
```
Package                        Current   Wanted   Latest  Location                                    Depended by
@anthropic-ai/sdk               0.30.1   0.30.1  0.125.0  node_modules/@anthropic-ai/sdk              Foundry
@clerk/nextjs                   6.39.6   6.39.6    7.9.2  node_modules/@clerk/nextjs                  Foundry
@hookform/resolvers             3.10.0   3.10.0    5.9.1  node_modules/@hookform/resolvers            Foundry
@playwright/test                1.61.1   1.63.0   1.63.0  node_modules/@playwright/test               Foundry
@prisma/client                  6.19.3   6.19.3   7.10.0  node_modules/@prisma/client                 Foundry
@radix-ui/react-dialog          1.1.20   1.1.23   1.1.23  node_modules/@radix-ui/react-dialog         Foundry
@radix-ui/react-dropdown-menu   2.1.21   2.1.24   2.1.24  node_modules/@radix-ui/react-dropdown-menu  Foundry
@radix-ui/react-popover         1.1.20   1.1.23   1.1.23  node_modules/@radix-ui/react-popover        Foundry
@radix-ui/react-select           2.3.4    2.3.7    2.3.7  node_modules/@radix-ui/react-select         Foundry
@radix-ui/react-tabs            1.1.18   1.1.21   1.1.21  node_modules/@radix-ui/react-tabs           Foundry
@radix-ui/react-toast           1.2.20   1.2.23   1.2.23  node_modules/@radix-ui/react-toast          Foundry
@react-pdf/renderer              4.5.1    4.9.0    4.9.0  node_modules/@react-pdf/renderer            Foundry
@tanstack/react-query          5.101.4  5.102.8  5.102.8  node_modules/@tanstack/react-query          Foundry
@tanstack/react-table           8.21.3   8.21.3    9.2.4  node_modules/@tanstack/react-table          Foundry
@types/node                    22.20.1  22.20.2   26.5.1  node_modules/@types/node                    Foundry
@types/react                   19.2.17   19.3.0   19.3.0  node_modules/@types/react                   Foundry
@upstash/ratelimit               2.0.8    2.1.0    2.1.0  node_modules/@upstash/ratelimit             Foundry
@upstash/redis                  1.38.0   1.38.4   1.38.4  node_modules/@upstash/redis                 Foundry
autoprefixer                    10.5.4   10.6.0   10.6.0  node_modules/autoprefixer                   Foundry
eslint                          9.39.5   9.39.5  10.10.0  node_modules/eslint                         Foundry
eslint-config-next             15.5.21  15.5.25   16.3.5  node_modules/eslint-config-next             Foundry
framer-motion                  11.18.2  11.18.2   13.3.0  node_modules/framer-motion                  Foundry
lucide-react                   0.468.0  0.468.0   1.46.0  node_modules/lucide-react                   Foundry
next                           15.5.21  15.5.25   16.3.5  node_modules/next                           Foundry
openai                         4.104.0  4.104.0   6.49.0  node_modules/openai                         Foundry
postcss                         8.5.22   8.5.28   8.5.28  node_modules/postcss                        Foundry
prisma                          6.19.3   6.19.3   7.10.0  node_modules/prisma                         Foundry
react                           19.2.8   19.3.0   19.3.0  node_modules/react                          Foundry
react-dom                       19.2.8   19.3.0   19.3.0  node_modules/react-dom                      Foundry
react-hook-form                 7.82.0   7.88.0   7.88.0  node_modules/react-hook-form                Foundry
recharts                        2.15.4   2.15.4   3.10.1  node_modules/recharts                       Foundry
resend                           4.8.0    4.8.0   6.28.0  node_modules/resend                         Foundry
stripe                          17.7.0   17.7.0   22.6.2  node_modules/stripe                         Foundry
svix                            1.98.0   1.99.1   1.99.1  node_modules/svix                           Foundry
tailwind-merge                   2.6.1    2.6.1    3.7.0  node_modules/tailwind-merge                 Foundry
tailwindcss                     3.4.19   3.4.19    4.3.3  node_modules/tailwindcss                    Foundry
tsx                             4.23.1  4.23.13  4.23.13  node_modules/tsx                            Foundry
typescript                       5.9.3    5.9.3    7.0.2  node_modules/typescript                     Foundry
vitest                           2.1.9    2.1.9   4.1.11  node_modules/vitest                         Foundry
zod                            3.25.76  3.25.76    4.6.5  node_modules/zod                            Foundry
```

### 2026-09-14 — typecheck/test status: pass

### 2026-09-18 — dependency freshness
```
Package                        Current   Wanted   Latest  Location                                    Depended by
@anthropic-ai/sdk               0.30.1   0.30.1  0.127.0  node_modules/@anthropic-ai/sdk              Foundry
@clerk/nextjs                   6.39.6   6.39.6    7.9.4  node_modules/@clerk/nextjs                  Foundry
@hookform/resolvers             3.10.0   3.10.0    5.9.1  node_modules/@hookform/resolvers            Foundry
@playwright/test                1.61.1   1.63.0   1.63.0  node_modules/@playwright/test               Foundry
@prisma/client                  6.19.3   6.19.3   7.10.0  node_modules/@prisma/client                 Foundry
@radix-ui/react-dialog          1.1.20   1.1.23   1.1.23  node_modules/@radix-ui/react-dialog         Foundry
@radix-ui/react-dropdown-menu   2.1.21   2.1.24   2.1.24  node_modules/@radix-ui/react-dropdown-menu  Foundry
@radix-ui/react-popover         1.1.20   1.1.23   1.1.23  node_modules/@radix-ui/react-popover        Foundry
@radix-ui/react-select           2.3.4    2.3.7    2.3.7  node_modules/@radix-ui/react-select         Foundry
@radix-ui/react-tabs            1.1.18   1.1.21   1.1.21  node_modules/@radix-ui/react-tabs           Foundry
@radix-ui/react-toast           1.2.20   1.2.23   1.2.23  node_modules/@radix-ui/react-toast          Foundry
@react-pdf/renderer              4.5.1    4.9.0    4.9.0  node_modules/@react-pdf/renderer            Foundry
@tanstack/react-query          5.101.4  5.103.1  5.103.1  node_modules/@tanstack/react-query          Foundry
@tanstack/react-table           8.21.3   8.21.3    9.2.4  node_modules/@tanstack/react-table          Foundry
@trpc/client                   11.18.0  11.19.0  11.19.0  node_modules/@trpc/client                   Foundry
@trpc/react-query              11.18.0  11.19.0  11.19.0  node_modules/@trpc/react-query              Foundry
@trpc/server                   11.18.0  11.19.0  11.19.0  node_modules/@trpc/server                   Foundry
@types/node                    22.20.1  22.20.3   26.6.1  node_modules/@types/node                    Foundry
@types/react                   19.2.17   19.3.0   19.3.0  node_modules/@types/react                   Foundry
@upstash/ratelimit               2.0.8    2.1.0    2.1.0  node_modules/@upstash/ratelimit             Foundry
@upstash/redis                  1.38.0   1.38.4   1.38.4  node_modules/@upstash/redis                 Foundry
autoprefixer                    10.5.4   10.6.1   10.6.1  node_modules/autoprefixer                   Foundry
eslint                          9.39.5   9.39.5  10.10.0  node_modules/eslint                         Foundry
eslint-config-next             15.5.21  15.5.25   16.3.5  node_modules/eslint-config-next             Foundry
framer-motion                  11.18.2  11.18.2   13.4.0  node_modules/framer-motion                  Foundry
lucide-react                   0.468.0  0.468.0   1.47.0  node_modules/lucide-react                   Foundry
next                           15.5.21  15.5.25   16.3.5  node_modules/next                           Foundry
openai                         4.104.0  4.104.0   6.49.0  node_modules/openai                         Foundry
postcss                         8.5.22   8.5.28   8.5.28  node_modules/postcss                        Foundry
prisma                          6.19.3   6.19.3   7.10.0  node_modules/prisma                         Foundry
react                           19.2.8   19.3.0   19.3.0  node_modules/react                          Foundry
react-dom                       19.2.8   19.3.0   19.3.0  node_modules/react-dom                      Foundry
react-hook-form                 7.82.0   7.88.0   7.88.0  node_modules/react-hook-form                Foundry
recharts                        2.15.4   2.15.4   3.10.1  node_modules/recharts                       Foundry
resend                           4.8.0    4.8.0   6.28.1  node_modules/resend                         Foundry
stripe                          17.7.0   17.7.0   22.6.2  node_modules/stripe                         Foundry
svix                            1.98.0   1.99.1   1.99.1  node_modules/svix                           Foundry
tailwind-merge                   2.6.1    2.6.1    3.7.0  node_modules/tailwind-merge                 Foundry
tailwindcss                     3.4.19   3.4.19    4.3.3  node_modules/tailwindcss                    Foundry
tsx                             4.23.1  4.23.13  4.23.13  node_modules/tsx                            Foundry
typescript                       5.9.3    5.9.3    7.0.2  node_modules/typescript                     Foundry
vitest                           2.1.9    2.1.9   4.1.11  node_modules/vitest                         Foundry
zod                            3.25.76  3.25.76    4.6.5  node_modules/zod                            Foundry
```

### 2026-09-18 — typecheck/test status: pass

### 2026-09-21 — dependency freshness
```
Package                        Current   Wanted   Latest  Location                                    Depended by
@anthropic-ai/sdk               0.30.1   0.30.1  0.127.0  node_modules/@anthropic-ai/sdk              Foundry
@clerk/nextjs                   6.39.6   6.39.7    7.9.4  node_modules/@clerk/nextjs                  Foundry
@hookform/resolvers             3.10.0   3.10.0    5.9.1  node_modules/@hookform/resolvers            Foundry
@playwright/test                1.61.1   1.63.0   1.63.0  node_modules/@playwright/test               Foundry
@prisma/client                  6.19.3   6.19.3   7.10.0  node_modules/@prisma/client                 Foundry
@radix-ui/react-dialog          1.1.20   1.1.23   1.1.23  node_modules/@radix-ui/react-dialog         Foundry
@radix-ui/react-dropdown-menu   2.1.21   2.1.24   2.1.24  node_modules/@radix-ui/react-dropdown-menu  Foundry
@radix-ui/react-popover         1.1.20   1.1.23   1.1.23  node_modules/@radix-ui/react-popover        Foundry
@radix-ui/react-select           2.3.4    2.3.7    2.3.7  node_modules/@radix-ui/react-select         Foundry
@radix-ui/react-tabs            1.1.18   1.1.21   1.1.21  node_modules/@radix-ui/react-tabs           Foundry
@radix-ui/react-toast           1.2.20   1.2.23   1.2.23  node_modules/@radix-ui/react-toast          Foundry
@react-pdf/renderer              4.5.1    4.9.0    4.9.0  node_modules/@react-pdf/renderer            Foundry
@tanstack/react-query          5.101.4  5.103.2  5.103.2  node_modules/@tanstack/react-query          Foundry
@tanstack/react-table           8.21.3   8.21.3    9.2.4  node_modules/@tanstack/react-table          Foundry
@trpc/client                   11.18.0  11.19.0  11.19.0  node_modules/@trpc/client                   Foundry
@trpc/react-query              11.18.0  11.19.0  11.19.0  node_modules/@trpc/react-query              Foundry
@trpc/server                   11.18.0  11.19.0  11.19.0  node_modules/@trpc/server                   Foundry
@types/node                    22.20.1  22.20.4   26.6.2  node_modules/@types/node                    Foundry
@types/react                   19.2.17   19.3.0   19.3.0  node_modules/@types/react                   Foundry
@upstash/ratelimit               2.0.8    2.1.0    2.1.0  node_modules/@upstash/ratelimit             Foundry
@upstash/redis                  1.38.0   1.39.0   1.39.0  node_modules/@upstash/redis                 Foundry
autoprefixer                    10.5.4   10.6.1   10.6.1  node_modules/autoprefixer                   Foundry
eslint                          9.39.5   9.39.5  10.11.0  node_modules/eslint                         Foundry
eslint-config-next             15.5.21  15.5.25   16.3.5  node_modules/eslint-config-next             Foundry
framer-motion                  11.18.2  11.18.2   13.4.0  node_modules/framer-motion                  Foundry
lucide-react                   0.468.0  0.468.0   1.47.0  node_modules/lucide-react                   Foundry
next                           15.5.21  15.5.25   16.3.5  node_modules/next                           Foundry
openai                         4.104.0  4.104.0   6.49.0  node_modules/openai                         Foundry
postcss                         8.5.22   8.5.28   8.5.28  node_modules/postcss                        Foundry
prisma                          6.19.3   6.19.3   7.10.0  node_modules/prisma                         Foundry
react                           19.2.8   19.3.0   19.3.0  node_modules/react                          Foundry
react-dom                       19.2.8   19.3.0   19.3.0  node_modules/react-dom                      Foundry
react-hook-form                 7.82.0   7.88.0   7.88.0  node_modules/react-hook-form                Foundry
recharts                        2.15.4   2.15.4   3.10.1  node_modules/recharts                       Foundry
resend                           4.8.0    4.8.0   6.28.1  node_modules/resend                         Foundry
stripe                          17.7.0   17.7.0   22.6.2  node_modules/stripe                         Foundry
svix                            1.98.0   1.99.1   1.99.1  node_modules/svix                           Foundry
tailwind-merge                   2.6.1    2.6.1    3.7.0  node_modules/tailwind-merge                 Foundry
tailwindcss                     3.4.19   3.4.19    4.3.3  node_modules/tailwindcss                    Foundry
tsx                             4.23.1  4.23.15  4.23.15  node_modules/tsx                            Foundry
typescript                       5.9.3    5.9.3    7.0.2  node_modules/typescript                     Foundry
vitest                           2.1.9    2.1.9   4.1.11  node_modules/vitest                         Foundry
zod                            3.25.76  3.25.76    4.6.5  node_modules/zod                            Foundry
```

### 2026-09-21 — typecheck/test status: pass

### 2026-09-22 — dependency freshness
```
Package                        Current   Wanted   Latest  Location                                    Depended by
@anthropic-ai/sdk               0.30.1   0.30.1  0.128.0  node_modules/@anthropic-ai/sdk              Foundry
@clerk/nextjs                   6.39.6   6.39.7    7.9.4  node_modules/@clerk/nextjs                  Foundry
@hookform/resolvers             3.10.0   3.10.0    5.9.1  node_modules/@hookform/resolvers            Foundry
@playwright/test                1.61.1   1.63.0   1.63.0  node_modules/@playwright/test               Foundry
@prisma/client                  6.19.3   6.19.3   7.10.0  node_modules/@prisma/client                 Foundry
@radix-ui/react-dialog          1.1.20   1.1.23   1.1.23  node_modules/@radix-ui/react-dialog         Foundry
@radix-ui/react-dropdown-menu   2.1.21   2.1.24   2.1.24  node_modules/@radix-ui/react-dropdown-menu  Foundry
@radix-ui/react-popover         1.1.20   1.1.23   1.1.23  node_modules/@radix-ui/react-popover        Foundry
@radix-ui/react-select           2.3.4    2.3.7    2.3.7  node_modules/@radix-ui/react-select         Foundry
@radix-ui/react-tabs            1.1.18   1.1.21   1.1.21  node_modules/@radix-ui/react-tabs           Foundry
@radix-ui/react-toast           1.2.20   1.2.23   1.2.23  node_modules/@radix-ui/react-toast          Foundry
@react-pdf/renderer              4.5.1    4.9.0    4.9.0  node_modules/@react-pdf/renderer            Foundry
@tanstack/react-query          5.101.4  5.103.2  5.103.2  node_modules/@tanstack/react-query          Foundry
@tanstack/react-table           8.21.3   8.21.3    9.2.4  node_modules/@tanstack/react-table          Foundry
@trpc/client                   11.18.0  11.19.0  11.19.0  node_modules/@trpc/client                   Foundry
@trpc/react-query              11.18.0  11.19.0  11.19.0  node_modules/@trpc/react-query              Foundry
@trpc/server                   11.18.0  11.19.0  11.19.0  node_modules/@trpc/server                   Foundry
@types/node                    22.20.1  22.20.4   26.6.2  node_modules/@types/node                    Foundry
@types/react                   19.2.17   19.3.0   19.3.0  node_modules/@types/react                   Foundry
@upstash/ratelimit               2.0.8    2.1.0    2.1.0  node_modules/@upstash/ratelimit             Foundry
@upstash/redis                  1.38.0   1.39.0   1.39.0  node_modules/@upstash/redis                 Foundry
autoprefixer                    10.5.4   10.6.1   10.6.1  node_modules/autoprefixer                   Foundry
eslint                          9.39.5   9.39.5  10.11.0  node_modules/eslint                         Foundry
eslint-config-next             15.5.21  15.5.26   16.3.6  node_modules/eslint-config-next             Foundry
framer-motion                  11.18.2  11.18.2   13.4.1  node_modules/framer-motion                  Foundry
lucide-react                   0.468.0  0.468.0   1.47.0  node_modules/lucide-react                   Foundry
next                           15.5.21  15.5.26   16.3.6  node_modules/next                           Foundry
openai                         4.104.0  4.104.0   6.49.0  node_modules/openai                         Foundry
postcss                         8.5.22   8.5.28   8.5.28  node_modules/postcss                        Foundry
prisma                          6.19.3   6.19.3   7.10.0  node_modules/prisma                         Foundry
react                           19.2.8   19.3.0   19.3.0  node_modules/react                          Foundry
react-dom                       19.2.8   19.3.0   19.3.0  node_modules/react-dom                      Foundry
react-hook-form                 7.82.0   7.88.0   7.88.0  node_modules/react-hook-form                Foundry
recharts                        2.15.4   2.15.4   3.10.1  node_modules/recharts                       Foundry
resend                           4.8.0    4.8.0   6.28.1  node_modules/resend                         Foundry
stripe                          17.7.0   17.7.0   22.6.2  node_modules/stripe                         Foundry
svix                            1.98.0   1.99.1   1.99.1  node_modules/svix                           Foundry
tailwind-merge                   2.6.1    2.6.1    3.7.0  node_modules/tailwind-merge                 Foundry
tailwindcss                     3.4.19   3.4.19    4.3.3  node_modules/tailwindcss                    Foundry
tsx                             4.23.1  4.23.15  4.23.15  node_modules/tsx                            Foundry
typescript                       5.9.3    5.9.3    7.0.2  node_modules/typescript                     Foundry
vitest                           2.1.9    2.1.9   4.1.11  node_modules/vitest                         Foundry
zod                            3.25.76  3.25.76    4.6.5  node_modules/zod                            Foundry
```

### 2026-09-22 — typecheck/test status: pass

### 2026-09-23 — dependency freshness
```
Package                        Current   Wanted   Latest  Location                                    Depended by
@anthropic-ai/sdk               0.30.1   0.30.1  0.128.0  node_modules/@anthropic-ai/sdk              Foundry
@clerk/nextjs                   6.39.6   6.39.7    7.9.5  node_modules/@clerk/nextjs                  Foundry
@hookform/resolvers             3.10.0   3.10.0    5.9.1  node_modules/@hookform/resolvers            Foundry
@playwright/test                1.61.1   1.63.0   1.63.0  node_modules/@playwright/test               Foundry
@prisma/client                  6.19.3   6.19.3   7.10.0  node_modules/@prisma/client                 Foundry
@radix-ui/react-dialog          1.1.20   1.1.23   1.1.23  node_modules/@radix-ui/react-dialog         Foundry
@radix-ui/react-dropdown-menu   2.1.21   2.1.24   2.1.24  node_modules/@radix-ui/react-dropdown-menu  Foundry
@radix-ui/react-popover         1.1.20   1.1.23   1.1.23  node_modules/@radix-ui/react-popover        Foundry
@radix-ui/react-select           2.3.4    2.3.7    2.3.7  node_modules/@radix-ui/react-select         Foundry
@radix-ui/react-tabs            1.1.18   1.1.21   1.1.21  node_modules/@radix-ui/react-tabs           Foundry
@radix-ui/react-toast           1.2.20   1.2.23   1.2.23  node_modules/@radix-ui/react-toast          Foundry
@react-pdf/renderer              4.5.1    4.9.0    4.9.0  node_modules/@react-pdf/renderer            Foundry
@tanstack/react-query          5.101.4  5.103.2  5.103.2  node_modules/@tanstack/react-query          Foundry
@tanstack/react-table           8.21.3   8.21.3    9.2.4  node_modules/@tanstack/react-table          Foundry
@trpc/client                   11.18.0  11.19.0  11.19.0  node_modules/@trpc/client                   Foundry
@trpc/react-query              11.18.0  11.19.0  11.19.0  node_modules/@trpc/react-query              Foundry
@trpc/server                   11.18.0  11.19.0  11.19.0  node_modules/@trpc/server                   Foundry
@types/node                    22.20.1  22.20.4   26.6.2  node_modules/@types/node                    Foundry
@types/react                   19.2.17   19.3.0   19.3.0  node_modules/@types/react                   Foundry
@upstash/ratelimit               2.0.8    2.2.0    2.2.0  node_modules/@upstash/ratelimit             Foundry
@upstash/redis                  1.38.0   1.39.0   1.39.0  node_modules/@upstash/redis                 Foundry
autoprefixer                    10.5.4   10.6.1   10.6.1  node_modules/autoprefixer                   Foundry
eslint                          9.39.5   9.39.5  10.11.0  node_modules/eslint                         Foundry
eslint-config-next             15.5.21  15.5.26   16.3.6  node_modules/eslint-config-next             Foundry
framer-motion                  11.18.2  11.18.2   13.4.2  node_modules/framer-motion                  Foundry
lucide-react                   0.468.0  0.468.0   1.47.0  node_modules/lucide-react                   Foundry
next                           15.5.21  15.5.26   16.3.6  node_modules/next                           Foundry
openai                         4.104.0  4.104.0   6.49.0  node_modules/openai                         Foundry
postcss                         8.5.22   8.5.28   8.5.28  node_modules/postcss                        Foundry
prisma                          6.19.3   6.19.3   7.10.0  node_modules/prisma                         Foundry
react                           19.2.8   19.3.0   19.3.0  node_modules/react                          Foundry
react-dom                       19.2.8   19.3.0   19.3.0  node_modules/react-dom                      Foundry
react-hook-form                 7.82.0   7.88.0   7.88.0  node_modules/react-hook-form                Foundry
recharts                        2.15.4   2.15.4   3.10.1  node_modules/recharts                       Foundry
resend                           4.8.0    4.8.0   6.28.1  node_modules/resend                         Foundry
stripe                          17.7.0   17.7.0   22.6.2  node_modules/stripe                         Foundry
svix                            1.98.0   1.99.1   1.99.1  node_modules/svix                           Foundry
tailwind-merge                   2.6.1    2.6.1    3.7.0  node_modules/tailwind-merge                 Foundry
tailwindcss                     3.4.19   3.4.19    4.3.3  node_modules/tailwindcss                    Foundry
tsx                             4.23.1  4.23.15  4.23.15  node_modules/tsx                            Foundry
typescript                       5.9.3    5.9.3    7.0.2  node_modules/typescript                     Foundry
vitest                           2.1.9    2.1.9   4.1.11  node_modules/vitest                         Foundry
zod                            3.25.76  3.25.76    4.6.5  node_modules/zod                            Foundry
```

### 2026-09-23 — typecheck/test status: pass

### 2026-09-24 — dependency freshness
```
Package                        Current   Wanted   Latest  Location                                    Depended by
@anthropic-ai/sdk               0.30.1   0.30.1  0.128.0  node_modules/@anthropic-ai/sdk              Foundry
@clerk/nextjs                   6.39.6   6.39.7    7.9.5  node_modules/@clerk/nextjs                  Foundry
@hookform/resolvers             3.10.0   3.10.0    5.9.1  node_modules/@hookform/resolvers            Foundry
@playwright/test                1.61.1   1.63.0   1.63.0  node_modules/@playwright/test               Foundry
@prisma/client                  6.19.3   6.19.3   7.10.0  node_modules/@prisma/client                 Foundry
@radix-ui/react-dialog          1.1.20   1.1.23   1.1.23  node_modules/@radix-ui/react-dialog         Foundry
@radix-ui/react-dropdown-menu   2.1.21   2.1.24   2.1.24  node_modules/@radix-ui/react-dropdown-menu  Foundry
@radix-ui/react-popover         1.1.20   1.1.23   1.1.23  node_modules/@radix-ui/react-popover        Foundry
@radix-ui/react-select           2.3.4    2.3.7    2.3.7  node_modules/@radix-ui/react-select         Foundry
@radix-ui/react-tabs            1.1.18   1.1.21   1.1.21  node_modules/@radix-ui/react-tabs           Foundry
@radix-ui/react-toast           1.2.20   1.2.23   1.2.23  node_modules/@radix-ui/react-toast          Foundry
@react-pdf/renderer              4.5.1    4.9.0    4.9.0  node_modules/@react-pdf/renderer            Foundry
@tanstack/react-query          5.101.4  5.103.2  5.103.2  node_modules/@tanstack/react-query          Foundry
@tanstack/react-table           8.21.3   8.21.3    9.2.4  node_modules/@tanstack/react-table          Foundry
@trpc/client                   11.18.0  11.19.0  11.19.0  node_modules/@trpc/client                   Foundry
@trpc/react-query              11.18.0  11.19.0  11.19.0  node_modules/@trpc/react-query              Foundry
@trpc/server                   11.18.0  11.19.0  11.19.0  node_modules/@trpc/server                   Foundry
@types/node                    22.20.1  22.20.4   26.6.2  node_modules/@types/node                    Foundry
@types/react                   19.2.17   19.3.0   19.3.0  node_modules/@types/react                   Foundry
@upstash/ratelimit               2.0.8    2.2.0    2.2.0  node_modules/@upstash/ratelimit             Foundry
@upstash/redis                  1.38.0   1.39.0   1.39.0  node_modules/@upstash/redis                 Foundry
autoprefixer                    10.5.4   10.6.1   10.6.1  node_modules/autoprefixer                   Foundry
eslint                          9.39.5   9.39.5  10.11.0  node_modules/eslint                         Foundry
eslint-config-next             15.5.21  15.5.26   16.3.6  node_modules/eslint-config-next             Foundry
framer-motion                  11.18.2  11.18.2   13.4.3  node_modules/framer-motion                  Foundry
lucide-react                   0.468.0  0.468.0   1.48.0  node_modules/lucide-react                   Foundry
next                           15.5.21  15.5.26   16.3.6  node_modules/next                           Foundry
openai                         4.104.0  4.104.0   6.49.0  node_modules/openai                         Foundry
postcss                         8.5.22   8.5.28   8.5.28  node_modules/postcss                        Foundry
prisma                          6.19.3   6.19.3   7.10.0  node_modules/prisma                         Foundry
react                           19.2.8   19.3.0   19.3.0  node_modules/react                          Foundry
react-dom                       19.2.8   19.3.0   19.3.0  node_modules/react-dom                      Foundry
react-hook-form                 7.82.0   7.88.0   7.88.0  node_modules/react-hook-form                Foundry
recharts                        2.15.4   2.15.4   3.10.1  node_modules/recharts                       Foundry
resend                           4.8.0    4.8.0   6.29.0  node_modules/resend                         Foundry
stripe                          17.7.0   17.7.0   22.6.2  node_modules/stripe                         Foundry
svix                            1.98.0   1.99.1   1.99.1  node_modules/svix                           Foundry
tailwind-merge                   2.6.1    2.6.1    3.7.0  node_modules/tailwind-merge                 Foundry
tailwindcss                     3.4.19   3.4.19    4.3.3  node_modules/tailwindcss                    Foundry
tsx                             4.23.1  4.23.15  4.23.15  node_modules/tsx                            Foundry
typescript                       5.9.3    5.9.3    7.0.2  node_modules/typescript                     Foundry
vitest                           2.1.9    2.1.9   4.1.11  node_modules/vitest                         Foundry
zod                            3.25.76  3.25.76    4.6.5  node_modules/zod                            Foundry
```

### 2026-09-24 — typecheck/test status: pass

### 2026-09-25 — dependency freshness
```
Package                        Current   Wanted   Latest  Location                                    Depended by
@anthropic-ai/sdk               0.30.1   0.30.1  0.128.0  node_modules/@anthropic-ai/sdk              Foundry
@clerk/nextjs                   6.39.6   6.39.7    7.9.7  node_modules/@clerk/nextjs                  Foundry
@hookform/resolvers             3.10.0   3.10.0    5.9.1  node_modules/@hookform/resolvers            Foundry
@playwright/test                1.61.1   1.63.0   1.63.0  node_modules/@playwright/test               Foundry
@prisma/client                  6.19.3   6.19.3   7.10.0  node_modules/@prisma/client                 Foundry
@radix-ui/react-dialog          1.1.20   1.1.23   1.1.23  node_modules/@radix-ui/react-dialog         Foundry
@radix-ui/react-dropdown-menu   2.1.21   2.1.24   2.1.24  node_modules/@radix-ui/react-dropdown-menu  Foundry
@radix-ui/react-popover         1.1.20   1.1.23   1.1.23  node_modules/@radix-ui/react-popover        Foundry
@radix-ui/react-select           2.3.4    2.3.7    2.3.7  node_modules/@radix-ui/react-select         Foundry
@radix-ui/react-tabs            1.1.18   1.1.21   1.1.21  node_modules/@radix-ui/react-tabs           Foundry
@radix-ui/react-toast           1.2.20   1.2.23   1.2.23  node_modules/@radix-ui/react-toast          Foundry
@react-pdf/renderer              4.5.1    4.9.0    4.9.0  node_modules/@react-pdf/renderer            Foundry
@tanstack/react-query          5.101.4  5.103.2  5.103.2  node_modules/@tanstack/react-query          Foundry
@tanstack/react-table           8.21.3   8.21.3    9.2.4  node_modules/@tanstack/react-table          Foundry
@trpc/client                   11.18.0  11.19.0  11.19.0  node_modules/@trpc/client                   Foundry
@trpc/react-query              11.18.0  11.19.0  11.19.0  node_modules/@trpc/react-query              Foundry
@trpc/server                   11.18.0  11.19.0  11.19.0  node_modules/@trpc/server                   Foundry
@types/node                    22.20.1  22.20.4   26.6.2  node_modules/@types/node                    Foundry
@types/react                   19.2.17   19.3.0   19.3.0  node_modules/@types/react                   Foundry
@upstash/ratelimit               2.0.8    2.2.0    2.2.0  node_modules/@upstash/ratelimit             Foundry
@upstash/redis                  1.38.0   1.39.0   1.39.0  node_modules/@upstash/redis                 Foundry
autoprefixer                    10.5.4   10.6.1   10.6.1  node_modules/autoprefixer                   Foundry
eslint                          9.39.5   9.39.5  10.11.0  node_modules/eslint                         Foundry
eslint-config-next             15.5.21  15.5.26   16.3.6  node_modules/eslint-config-next             Foundry
framer-motion                  11.18.2  11.18.2   13.4.4  node_modules/framer-motion                  Foundry
lucide-react                   0.468.0  0.468.0   1.48.0  node_modules/lucide-react                   Foundry
next                           15.5.21  15.5.26   16.3.6  node_modules/next                           Foundry
openai                         4.104.0  4.104.0   6.49.0  node_modules/openai                         Foundry
postcss                         8.5.22   8.5.28   8.5.28  node_modules/postcss                        Foundry
prisma                          6.19.3   6.19.3   7.10.0  node_modules/prisma                         Foundry
react                           19.2.8   19.3.0   19.3.0  node_modules/react                          Foundry
react-dom                       19.2.8   19.3.0   19.3.0  node_modules/react-dom                      Foundry
react-hook-form                 7.82.0   7.88.0   7.88.0  node_modules/react-hook-form                Foundry
recharts                        2.15.4   2.15.4   3.10.1  node_modules/recharts                       Foundry
resend                           4.8.0    4.8.0   6.30.0  node_modules/resend                         Foundry
stripe                          17.7.0   17.7.0   22.6.2  node_modules/stripe                         Foundry
svix                            1.98.0   1.99.1   1.99.1  node_modules/svix                           Foundry
tailwind-merge                   2.6.1    2.6.1    3.7.0  node_modules/tailwind-merge                 Foundry
tailwindcss                     3.4.19   3.4.19    4.3.3  node_modules/tailwindcss                    Foundry
tsx                             4.23.1  4.23.15  4.23.15  node_modules/tsx                            Foundry
typescript                       5.9.3    5.9.3    7.0.2  node_modules/typescript                     Foundry
vitest                           2.1.9    2.1.9   4.1.11  node_modules/vitest                         Foundry
zod                            3.25.76  3.25.76    4.6.5  node_modules/zod                            Foundry
```

### 2026-09-25 — typecheck/test status: pass

### 2026-09-27 — dependency freshness
```
Package                        Current   Wanted   Latest  Location                                    Depended by
@anthropic-ai/sdk               0.30.1   0.30.1  0.128.0  node_modules/@anthropic-ai/sdk              Foundry
@clerk/nextjs                   6.39.6   6.39.7    7.9.7  node_modules/@clerk/nextjs                  Foundry
@hookform/resolvers             3.10.0   3.10.0    5.9.1  node_modules/@hookform/resolvers            Foundry
@playwright/test                1.61.1   1.63.0   1.63.0  node_modules/@playwright/test               Foundry
@prisma/client                  6.19.3   6.19.3   7.10.0  node_modules/@prisma/client                 Foundry
@radix-ui/react-dialog          1.1.20   1.1.23   1.1.23  node_modules/@radix-ui/react-dialog         Foundry
@radix-ui/react-dropdown-menu   2.1.21   2.1.24   2.1.24  node_modules/@radix-ui/react-dropdown-menu  Foundry
@radix-ui/react-popover         1.1.20   1.1.23   1.1.23  node_modules/@radix-ui/react-popover        Foundry
@radix-ui/react-select           2.3.4    2.3.7    2.3.7  node_modules/@radix-ui/react-select         Foundry
@radix-ui/react-tabs            1.1.18   1.1.21   1.1.21  node_modules/@radix-ui/react-tabs           Foundry
@radix-ui/react-toast           1.2.20   1.2.23   1.2.23  node_modules/@radix-ui/react-toast          Foundry
@react-pdf/renderer              4.5.1    4.9.0    4.9.0  node_modules/@react-pdf/renderer            Foundry
@tanstack/react-query          5.101.4  5.104.0  5.104.0  node_modules/@tanstack/react-query          Foundry
@tanstack/react-table           8.21.3   8.21.3    9.2.4  node_modules/@tanstack/react-table          Foundry
@trpc/client                   11.18.0  11.19.0  11.19.0  node_modules/@trpc/client                   Foundry
@trpc/react-query              11.18.0  11.19.0  11.19.0  node_modules/@trpc/react-query              Foundry
@trpc/server                   11.18.0  11.19.0  11.19.0  node_modules/@trpc/server                   Foundry
@types/node                    22.20.1  22.20.4   26.6.3  node_modules/@types/node                    Foundry
@types/react                   19.2.17   19.3.0   19.3.0  node_modules/@types/react                   Foundry
@upstash/ratelimit               2.0.8    2.2.0    2.2.0  node_modules/@upstash/ratelimit             Foundry
@upstash/redis                  1.38.0   1.39.0   1.39.0  node_modules/@upstash/redis                 Foundry
autoprefixer                    10.5.4   10.6.1   10.6.1  node_modules/autoprefixer                   Foundry
eslint                          9.39.5   9.39.5  10.11.0  node_modules/eslint                         Foundry
eslint-config-next             15.5.21  15.5.26   16.3.6  node_modules/eslint-config-next             Foundry
framer-motion                  11.18.2  11.18.2   13.4.4  node_modules/framer-motion                  Foundry
lucide-react                   0.468.0  0.468.0   1.48.0  node_modules/lucide-react                   Foundry
next                           15.5.21  15.5.26   16.3.6  node_modules/next                           Foundry
openai                         4.104.0  4.104.0   6.49.0  node_modules/openai                         Foundry
postcss                         8.5.22   8.5.28   8.5.28  node_modules/postcss                        Foundry
prisma                          6.19.3   6.19.3   7.10.0  node_modules/prisma                         Foundry
react                           19.2.8   19.3.0   19.3.0  node_modules/react                          Foundry
react-dom                       19.2.8   19.3.0   19.3.0  node_modules/react-dom                      Foundry
react-hook-form                 7.82.0   7.89.0   7.89.0  node_modules/react-hook-form                Foundry
recharts                        2.15.4   2.15.4   3.10.1  node_modules/recharts                       Foundry
resend                           4.8.0    4.8.0   6.30.0  node_modules/resend                         Foundry
stripe                          17.7.0   17.7.0   22.6.2  node_modules/stripe                         Foundry
svix                            1.98.0   1.99.1   1.99.1  node_modules/svix                           Foundry
tailwind-merge                   2.6.1    2.6.1    3.7.0  node_modules/tailwind-merge                 Foundry
tailwindcss                     3.4.19   3.4.19    4.3.3  node_modules/tailwindcss                    Foundry
tsx                             4.23.1  4.23.15  4.23.15  node_modules/tsx                            Foundry
typescript                       5.9.3    5.9.3    7.0.2  node_modules/typescript                     Foundry
vitest                           2.1.9    2.1.9   4.1.11  node_modules/vitest                         Foundry
zod                            3.25.76  3.25.76    4.6.5  node_modules/zod                            Foundry
```

### 2026-09-27 — typecheck/test status: pass

### 2026-09-28 — dependency freshness
```
Package                        Current   Wanted   Latest  Location                                    Depended by
@anthropic-ai/sdk               0.30.1   0.30.1  0.129.0  node_modules/@anthropic-ai/sdk              Foundry
@clerk/nextjs                   6.39.6   6.39.7    7.9.7  node_modules/@clerk/nextjs                  Foundry
@hookform/resolvers             3.10.0   3.10.0    5.9.1  node_modules/@hookform/resolvers            Foundry
@playwright/test                1.61.1   1.63.0   1.63.0  node_modules/@playwright/test               Foundry
@prisma/client                  6.19.3   6.19.3   7.10.0  node_modules/@prisma/client                 Foundry
@radix-ui/react-dialog          1.1.20   1.1.23   1.1.23  node_modules/@radix-ui/react-dialog         Foundry
@radix-ui/react-dropdown-menu   2.1.21   2.1.24   2.1.24  node_modules/@radix-ui/react-dropdown-menu  Foundry
@radix-ui/react-popover         1.1.20   1.1.23   1.1.23  node_modules/@radix-ui/react-popover        Foundry
@radix-ui/react-select           2.3.4    2.3.7    2.3.7  node_modules/@radix-ui/react-select         Foundry
@radix-ui/react-tabs            1.1.18   1.1.21   1.1.21  node_modules/@radix-ui/react-tabs           Foundry
@radix-ui/react-toast           1.2.20   1.2.23   1.2.23  node_modules/@radix-ui/react-toast          Foundry
@react-pdf/renderer              4.5.1    4.9.0    4.9.0  node_modules/@react-pdf/renderer            Foundry
@tanstack/react-query          5.101.4  5.104.0  5.104.0  node_modules/@tanstack/react-query          Foundry
@tanstack/react-table           8.21.3   8.21.3    9.2.4  node_modules/@tanstack/react-table          Foundry
@trpc/client                   11.18.0  11.19.0  11.19.0  node_modules/@trpc/client                   Foundry
@trpc/react-query              11.18.0  11.19.0  11.19.0  node_modules/@trpc/react-query              Foundry
@trpc/server                   11.18.0  11.19.0  11.19.0  node_modules/@trpc/server                   Foundry
@types/node                    22.20.1  22.20.4   26.6.3  node_modules/@types/node                    Foundry
@types/react                   19.2.17   19.3.0   19.3.0  node_modules/@types/react                   Foundry
@upstash/ratelimit               2.0.8    2.2.0    2.2.0  node_modules/@upstash/ratelimit             Foundry
@upstash/redis                  1.38.0   1.39.0   1.39.0  node_modules/@upstash/redis                 Foundry
autoprefixer                    10.5.4   10.6.1   10.6.1  node_modules/autoprefixer                   Foundry
eslint                          9.39.5   9.39.5  10.11.0  node_modules/eslint                         Foundry
eslint-config-next             15.5.21  15.5.26   16.3.6  node_modules/eslint-config-next             Foundry
framer-motion                  11.18.2  11.18.2   13.4.4  node_modules/framer-motion                  Foundry
lucide-react                   0.468.0  0.468.0   1.48.0  node_modules/lucide-react                   Foundry
next                           15.5.21  15.5.26   16.3.6  node_modules/next                           Foundry
openai                         4.104.0  4.104.0   6.49.0  node_modules/openai                         Foundry
postcss                         8.5.22   8.5.28   8.5.28  node_modules/postcss                        Foundry
prisma                          6.19.3   6.19.3   7.10.0  node_modules/prisma                         Foundry
react                           19.2.8   19.3.0   19.3.0  node_modules/react                          Foundry
react-dom                       19.2.8   19.3.0   19.3.0  node_modules/react-dom                      Foundry
react-hook-form                 7.82.0   7.89.0   7.89.0  node_modules/react-hook-form                Foundry
recharts                        2.15.4   2.15.4   3.10.1  node_modules/recharts                       Foundry
resend                           4.8.0    4.8.0   6.30.0  node_modules/resend                         Foundry
stripe                          17.7.0   17.7.0   22.6.2  node_modules/stripe                         Foundry
svix                            1.98.0   1.99.1   1.99.1  node_modules/svix                           Foundry
tailwind-merge                   2.6.1    2.6.1    3.7.0  node_modules/tailwind-merge                 Foundry
tailwindcss                     3.4.19   3.4.19    4.3.3  node_modules/tailwindcss                    Foundry
tsx                             4.23.1  4.23.15  4.23.15  node_modules/tsx                            Foundry
typescript                       5.9.3    5.9.3    7.0.2  node_modules/typescript                     Foundry
vitest                           2.1.9    2.1.9   4.1.11  node_modules/vitest                         Foundry
zod                            3.25.76  3.25.76    4.6.5  node_modules/zod                            Foundry
```

### 2026-09-28 — typecheck/test status: pass

