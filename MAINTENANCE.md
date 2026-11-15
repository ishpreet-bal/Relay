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

### 2026-09-29 — dependency freshness
```
Package                        Current   Wanted   Latest  Location                                    Depended by
@anthropic-ai/sdk               0.30.1   0.30.1  0.129.0  node_modules/@anthropic-ai/sdk              Foundry
@clerk/nextjs                   6.39.6   6.39.7    7.9.8  node_modules/@clerk/nextjs                  Foundry
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
eslint-config-next             15.5.21  15.5.26   16.3.7  node_modules/eslint-config-next             Foundry
framer-motion                  11.18.2  11.18.2   13.4.6  node_modules/framer-motion                  Foundry
lucide-react                   0.468.0  0.468.0   1.48.0  node_modules/lucide-react                   Foundry
next                           15.5.21  15.5.26   16.3.7  node_modules/next                           Foundry
openai                         4.104.0  4.104.0   6.49.0  node_modules/openai                         Foundry
postcss                         8.5.22   8.5.28   8.5.28  node_modules/postcss                        Foundry
prisma                          6.19.3   6.19.3   7.10.0  node_modules/prisma                         Foundry
react                           19.2.8   19.3.0   19.3.0  node_modules/react                          Foundry
react-dom                       19.2.8   19.3.0   19.3.0  node_modules/react-dom                      Foundry
react-hook-form                 7.82.0   7.89.0   7.89.0  node_modules/react-hook-form                Foundry
recharts                        2.15.4   2.15.4   3.10.1  node_modules/recharts                       Foundry
resend                           4.8.0    4.8.0   6.31.0  node_modules/resend                         Foundry
stripe                          17.7.0   17.7.0   22.6.2  node_modules/stripe                         Foundry
svix                            1.98.0   1.99.1   1.99.1  node_modules/svix                           Foundry
tailwind-merge                   2.6.1    2.6.1    3.7.0  node_modules/tailwind-merge                 Foundry
tailwindcss                     3.4.19   3.4.19    4.3.3  node_modules/tailwindcss                    Foundry
tsx                             4.23.1  4.23.15  4.23.15  node_modules/tsx                            Foundry
typescript                       5.9.3    5.9.3    7.0.2  node_modules/typescript                     Foundry
vitest                           2.1.9    2.1.9   4.1.11  node_modules/vitest                         Foundry
zod                            3.25.76  3.25.76    4.6.5  node_modules/zod                            Foundry
```

### 2026-09-29 — typecheck/test status: pass

### 2026-10-02 — dependency freshness
```
Package                        Current   Wanted   Latest  Location                                    Depended by
@anthropic-ai/sdk               0.30.1   0.30.1  0.131.0  node_modules/@anthropic-ai/sdk              Foundry
@clerk/nextjs                   6.39.6   6.39.7   7.9.10  node_modules/@clerk/nextjs                  Foundry
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
@tanstack/react-query          5.101.4  5.104.1  5.104.1  node_modules/@tanstack/react-query          Foundry
@tanstack/react-table           8.21.3   8.21.3    9.2.4  node_modules/@tanstack/react-table          Foundry
@trpc/client                   11.18.0  11.19.0  11.19.0  node_modules/@trpc/client                   Foundry
@trpc/react-query              11.18.0  11.19.0  11.19.0  node_modules/@trpc/react-query              Foundry
@trpc/server                   11.18.0  11.19.0  11.19.0  node_modules/@trpc/server                   Foundry
@types/node                    22.20.1  22.20.5   26.6.4  node_modules/@types/node                    Foundry
@types/react                   19.2.17   19.3.0   19.3.0  node_modules/@types/react                   Foundry
@upstash/ratelimit               2.0.8    2.2.0    2.2.0  node_modules/@upstash/ratelimit             Foundry
@upstash/redis                  1.38.0   1.39.0   1.39.0  node_modules/@upstash/redis                 Foundry
autoprefixer                    10.5.4   10.6.1   10.6.1  node_modules/autoprefixer                   Foundry
eslint                          9.39.5   9.39.5  10.11.0  node_modules/eslint                         Foundry
eslint-config-next             15.5.21  15.5.27   16.3.8  node_modules/eslint-config-next             Foundry
framer-motion                  11.18.2  11.18.2   14.0.0  node_modules/framer-motion                  Foundry
lucide-react                   0.468.0  0.468.0   1.50.0  node_modules/lucide-react                   Foundry
next                           15.5.21  15.5.27   16.3.8  node_modules/next                           Foundry
openai                         4.104.0  4.104.0   6.49.0  node_modules/openai                         Foundry
postcss                         8.5.22   8.5.28   8.5.28  node_modules/postcss                        Foundry
prisma                          6.19.3   6.19.3   7.10.0  node_modules/prisma                         Foundry
react                           19.2.8   19.3.0   19.3.0  node_modules/react                          Foundry
react-dom                       19.2.8   19.3.0   19.3.0  node_modules/react-dom                      Foundry
react-hook-form                 7.82.0   7.89.0   7.89.0  node_modules/react-hook-form                Foundry
recharts                        2.15.4   2.15.4   3.10.1  node_modules/recharts                       Foundry
resend                           4.8.0    4.8.0   6.32.0  node_modules/resend                         Foundry
stripe                          17.7.0   17.7.0   23.0.0  node_modules/stripe                         Foundry
svix                            1.98.0   1.99.1   1.99.1  node_modules/svix                           Foundry
tailwind-merge                   2.6.1    2.6.1    3.7.0  node_modules/tailwind-merge                 Foundry
tailwindcss                     3.4.19   3.4.19    4.3.3  node_modules/tailwindcss                    Foundry
tsx                             4.23.1  4.23.15  4.23.15  node_modules/tsx                            Foundry
typescript                       5.9.3    5.9.3    7.0.2  node_modules/typescript                     Foundry
vitest                           2.1.9    2.1.9   4.1.11  node_modules/vitest                         Foundry
zod                            3.25.76  3.25.76    4.6.5  node_modules/zod                            Foundry
```

### 2026-10-02 — typecheck/test status: pass

### 2026-10-05 — dependency freshness
```
Package                        Current   Wanted   Latest  Location                                    Depended by
@anthropic-ai/sdk               0.30.1   0.30.1  0.131.0  node_modules/@anthropic-ai/sdk              Foundry
@clerk/nextjs                   6.39.6   6.39.7   7.9.11  node_modules/@clerk/nextjs                  Foundry
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
@tanstack/react-query          5.101.4  5.104.1  5.104.1  node_modules/@tanstack/react-query          Foundry
@tanstack/react-table           8.21.3   8.21.3    9.2.6  node_modules/@tanstack/react-table          Foundry
@trpc/client                   11.18.0  11.19.0  11.19.0  node_modules/@trpc/client                   Foundry
@trpc/react-query              11.18.0  11.19.0  11.19.0  node_modules/@trpc/react-query              Foundry
@trpc/server                   11.18.0  11.19.0  11.19.0  node_modules/@trpc/server                   Foundry
@types/node                    22.20.1  22.20.5   26.6.4  node_modules/@types/node                    Foundry
@types/react                   19.2.17   19.3.0   19.3.0  node_modules/@types/react                   Foundry
@upstash/ratelimit               2.0.8    2.2.0    2.2.0  node_modules/@upstash/ratelimit             Foundry
@upstash/redis                  1.38.0   1.39.0   1.39.0  node_modules/@upstash/redis                 Foundry
autoprefixer                    10.5.4   10.6.1   10.6.1  node_modules/autoprefixer                   Foundry
eslint                          9.39.5   9.39.5  10.12.0  node_modules/eslint                         Foundry
eslint-config-next             15.5.21  15.5.27   16.3.8  node_modules/eslint-config-next             Foundry
framer-motion                  11.18.2  11.18.2   14.0.0  node_modules/framer-motion                  Foundry
lucide-react                   0.468.0  0.468.0   1.52.0  node_modules/lucide-react                   Foundry
next                           15.5.21  15.5.27   16.3.8  node_modules/next                           Foundry
openai                         4.104.0  4.104.0   6.49.0  node_modules/openai                         Foundry
postcss                         8.5.22   8.5.29   8.5.29  node_modules/postcss                        Foundry
prisma                          6.19.3   6.19.3   7.10.0  node_modules/prisma                         Foundry
react                           19.2.8   19.3.0   19.3.0  node_modules/react                          Foundry
react-dom                       19.2.8   19.3.0   19.3.0  node_modules/react-dom                      Foundry
react-hook-form                 7.82.0   7.89.0   7.89.0  node_modules/react-hook-form                Foundry
recharts                        2.15.4   2.15.4   3.10.1  node_modules/recharts                       Foundry
resend                           4.8.0    4.8.0   6.32.0  node_modules/resend                         Foundry
stripe                          17.7.0   17.7.0   23.0.0  node_modules/stripe                         Foundry
svix                            1.98.0   1.99.1   1.99.1  node_modules/svix                           Foundry
tailwind-merge                   2.6.1    2.6.1    3.7.0  node_modules/tailwind-merge                 Foundry
tailwindcss                     3.4.19   3.4.19    4.3.3  node_modules/tailwindcss                    Foundry
tsx                             4.23.1  4.23.15  4.23.15  node_modules/tsx                            Foundry
typescript                       5.9.3    5.9.3    7.0.2  node_modules/typescript                     Foundry
vitest                           2.1.9    2.1.9   4.1.11  node_modules/vitest                         Foundry
zod                            3.25.76  3.25.76    4.6.5  node_modules/zod                            Foundry
```

### 2026-10-05 — typecheck/test status: pass

### 2026-10-06 — dependency freshness
```
Package                        Current   Wanted   Latest  Location                                    Depended by
@anthropic-ai/sdk               0.30.1   0.30.1  0.131.0  node_modules/@anthropic-ai/sdk              Relay
@clerk/nextjs                   6.39.6   6.39.7   7.9.11  node_modules/@clerk/nextjs                  Relay
@hookform/resolvers             3.10.0   3.10.0    5.9.1  node_modules/@hookform/resolvers            Relay
@playwright/test                1.61.1   1.63.0   1.63.0  node_modules/@playwright/test               Relay
@prisma/client                  6.19.3   6.19.3   7.10.0  node_modules/@prisma/client                 Relay
@radix-ui/react-dialog          1.1.20    1.2.0    1.2.0  node_modules/@radix-ui/react-dialog         Relay
@radix-ui/react-dropdown-menu   2.1.21   2.1.25   2.1.25  node_modules/@radix-ui/react-dropdown-menu  Relay
@radix-ui/react-popover         1.1.20    1.2.0    1.2.0  node_modules/@radix-ui/react-popover        Relay
@radix-ui/react-select           2.3.4    2.3.8    2.3.8  node_modules/@radix-ui/react-select         Relay
@radix-ui/react-tabs            1.1.18   1.1.22   1.1.22  node_modules/@radix-ui/react-tabs           Relay
@radix-ui/react-toast           1.2.20   1.2.24   1.2.24  node_modules/@radix-ui/react-toast          Relay
@react-pdf/renderer              4.5.1    4.9.0    4.9.0  node_modules/@react-pdf/renderer            Relay
@tanstack/react-query          5.101.4  5.104.1  5.104.1  node_modules/@tanstack/react-query          Relay
@tanstack/react-table           8.21.3   8.21.3    9.2.6  node_modules/@tanstack/react-table          Relay
@trpc/client                   11.18.0  11.19.0  11.19.0  node_modules/@trpc/client                   Relay
@trpc/react-query              11.18.0  11.19.0  11.19.0  node_modules/@trpc/react-query              Relay
@trpc/server                   11.18.0  11.19.0  11.19.0  node_modules/@trpc/server                   Relay
@types/node                    22.20.1  22.20.5   26.6.4  node_modules/@types/node                    Relay
@types/react                   19.2.17   19.3.0   19.3.0  node_modules/@types/react                   Relay
@upstash/ratelimit               2.0.8    2.2.0    2.2.0  node_modules/@upstash/ratelimit             Relay
@upstash/redis                  1.38.0   1.39.0   1.39.0  node_modules/@upstash/redis                 Relay
autoprefixer                    10.5.4   10.6.1   10.6.1  node_modules/autoprefixer                   Relay
eslint                          9.39.5   9.39.5  10.12.0  node_modules/eslint                         Relay
eslint-config-next             15.5.21  15.5.27   16.4.0  node_modules/eslint-config-next             Relay
framer-motion                  11.18.2  11.18.2   14.0.0  node_modules/framer-motion                  Relay
lucide-react                   0.468.0  0.468.0   1.52.0  node_modules/lucide-react                   Relay
next                           15.5.21  15.5.27   16.4.0  node_modules/next                           Relay
openai                         4.104.0  4.104.0   6.49.0  node_modules/openai                         Relay
postcss                         8.5.22   8.5.29   8.5.29  node_modules/postcss                        Relay
prisma                          6.19.3   6.19.3   7.10.0  node_modules/prisma                         Relay
react                           19.2.8   19.3.0   19.3.0  node_modules/react                          Relay
react-dom                       19.2.8   19.3.0   19.3.0  node_modules/react-dom                      Relay
react-hook-form                 7.82.0   7.89.0   7.89.0  node_modules/react-hook-form                Relay
recharts                        2.15.4   2.15.4   3.10.1  node_modules/recharts                       Relay
resend                           4.8.0    4.8.0   6.32.1  node_modules/resend                         Relay
stripe                          17.7.0   17.7.0   23.0.0  node_modules/stripe                         Relay
svix                            1.98.0   1.99.1   1.99.1  node_modules/svix                           Relay
tailwind-merge                   2.6.1    2.6.1    3.7.0  node_modules/tailwind-merge                 Relay
tailwindcss                     3.4.19   3.4.19    4.3.3  node_modules/tailwindcss                    Relay
tsx                             4.23.1  4.23.15  4.23.15  node_modules/tsx                            Relay
typescript                       5.9.3    5.9.3    7.0.2  node_modules/typescript                     Relay
vitest                           2.1.9    2.1.9   4.1.11  node_modules/vitest                         Relay
zod                            3.25.76  3.25.76    4.6.5  node_modules/zod                            Relay
```

### 2026-10-06 — typecheck/test status: pass

### 2026-10-07 — dependency freshness
```
Package                        Current   Wanted   Latest  Location                                    Depended by
@anthropic-ai/sdk               0.30.1   0.30.1  0.132.0  node_modules/@anthropic-ai/sdk              Relay
@clerk/nextjs                   6.39.6   6.39.7   7.9.11  node_modules/@clerk/nextjs                  Relay
@hookform/resolvers             3.10.0   3.10.0    5.9.1  node_modules/@hookform/resolvers            Relay
@playwright/test                1.61.1   1.64.0   1.64.0  node_modules/@playwright/test               Relay
@prisma/client                  6.19.3   6.19.3   7.10.0  node_modules/@prisma/client                 Relay
@radix-ui/react-dialog          1.1.20    1.2.0    1.2.0  node_modules/@radix-ui/react-dialog         Relay
@radix-ui/react-dropdown-menu   2.1.21   2.1.25   2.1.25  node_modules/@radix-ui/react-dropdown-menu  Relay
@radix-ui/react-popover         1.1.20    1.2.0    1.2.0  node_modules/@radix-ui/react-popover        Relay
@radix-ui/react-select           2.3.4    2.3.8    2.3.8  node_modules/@radix-ui/react-select         Relay
@radix-ui/react-tabs            1.1.18   1.1.22   1.1.22  node_modules/@radix-ui/react-tabs           Relay
@radix-ui/react-toast           1.2.20   1.2.24   1.2.24  node_modules/@radix-ui/react-toast          Relay
@react-pdf/renderer              4.5.1    4.9.0    4.9.0  node_modules/@react-pdf/renderer            Relay
@tanstack/react-query          5.101.4  5.104.1  5.104.1  node_modules/@tanstack/react-query          Relay
@tanstack/react-table           8.21.3   8.21.3    9.2.6  node_modules/@tanstack/react-table          Relay
@trpc/client                   11.18.0  11.19.0  11.19.0  node_modules/@trpc/client                   Relay
@trpc/react-query              11.18.0  11.19.0  11.19.0  node_modules/@trpc/react-query              Relay
@trpc/server                   11.18.0  11.19.0  11.19.0  node_modules/@trpc/server                   Relay
@types/node                    22.20.1  22.20.5   26.6.4  node_modules/@types/node                    Relay
@types/react                   19.2.17   19.3.0   19.3.0  node_modules/@types/react                   Relay
@upstash/ratelimit               2.0.8    2.2.0    2.2.0  node_modules/@upstash/ratelimit             Relay
@upstash/redis                  1.38.0   1.39.0   1.39.0  node_modules/@upstash/redis                 Relay
autoprefixer                    10.5.4   10.6.1   10.6.1  node_modules/autoprefixer                   Relay
eslint                          9.39.5   9.39.5  10.12.0  node_modules/eslint                         Relay
eslint-config-next             15.5.21  15.5.27   16.4.0  node_modules/eslint-config-next             Relay
framer-motion                  11.18.2  11.18.2   14.0.0  node_modules/framer-motion                  Relay
lucide-react                   0.468.0  0.468.0   1.52.0  node_modules/lucide-react                   Relay
next                           15.5.21  15.5.27   16.4.0  node_modules/next                           Relay
openai                         4.104.0  4.104.0   6.49.0  node_modules/openai                         Relay
postcss                         8.5.22   8.5.29   8.5.29  node_modules/postcss                        Relay
prisma                          6.19.3   6.19.3   7.10.0  node_modules/prisma                         Relay
react                           19.2.8   19.3.0   19.3.0  node_modules/react                          Relay
react-dom                       19.2.8   19.3.0   19.3.0  node_modules/react-dom                      Relay
react-hook-form                 7.82.0   7.89.0   7.89.0  node_modules/react-hook-form                Relay
recharts                        2.15.4   2.15.4   3.10.1  node_modules/recharts                       Relay
resend                           4.8.0    4.8.0   6.32.1  node_modules/resend                         Relay
stripe                          17.7.0   17.7.0   23.0.0  node_modules/stripe                         Relay
svix                            1.98.0   1.99.1   1.99.1  node_modules/svix                           Relay
tailwind-merge                   2.6.1    2.6.1    3.7.0  node_modules/tailwind-merge                 Relay
tailwindcss                     3.4.19   3.4.19    4.3.3  node_modules/tailwindcss                    Relay
tsx                             4.23.1  4.23.15  4.23.15  node_modules/tsx                            Relay
typescript                       5.9.3    5.9.3    7.0.2  node_modules/typescript                     Relay
vitest                           2.1.9    2.1.9   4.1.11  node_modules/vitest                         Relay
zod                            3.25.76  3.25.76    4.6.5  node_modules/zod                            Relay
```

### 2026-10-07 — typecheck/test status: pass

### 2026-10-08 — dependency freshness
```
Package                        Current   Wanted   Latest  Location                                    Depended by
@anthropic-ai/sdk               0.30.1   0.30.1  0.132.1  node_modules/@anthropic-ai/sdk              Relay
@clerk/nextjs                   6.39.6   6.39.7   7.9.13  node_modules/@clerk/nextjs                  Relay
@hookform/resolvers             3.10.0   3.10.0    5.9.1  node_modules/@hookform/resolvers            Relay
@playwright/test                1.61.1   1.64.0   1.64.0  node_modules/@playwright/test               Relay
@prisma/client                  6.19.3   6.19.3   7.10.0  node_modules/@prisma/client                 Relay
@radix-ui/react-dialog          1.1.20    1.2.0    1.2.0  node_modules/@radix-ui/react-dialog         Relay
@radix-ui/react-dropdown-menu   2.1.21   2.1.25   2.1.25  node_modules/@radix-ui/react-dropdown-menu  Relay
@radix-ui/react-popover         1.1.20    1.2.0    1.2.0  node_modules/@radix-ui/react-popover        Relay
@radix-ui/react-select           2.3.4    2.3.8    2.3.8  node_modules/@radix-ui/react-select         Relay
@radix-ui/react-tabs            1.1.18   1.1.22   1.1.22  node_modules/@radix-ui/react-tabs           Relay
@radix-ui/react-toast           1.2.20   1.2.24   1.2.24  node_modules/@radix-ui/react-toast          Relay
@react-pdf/renderer              4.5.1    4.9.0    4.9.0  node_modules/@react-pdf/renderer            Relay
@tanstack/react-query          5.101.4  5.104.1  5.104.1  node_modules/@tanstack/react-query          Relay
@tanstack/react-table           8.21.3   8.21.3    9.2.6  node_modules/@tanstack/react-table          Relay
@trpc/client                   11.18.0  11.19.0  11.19.0  node_modules/@trpc/client                   Relay
@trpc/react-query              11.18.0  11.19.0  11.19.0  node_modules/@trpc/react-query              Relay
@trpc/server                   11.18.0  11.19.0  11.19.0  node_modules/@trpc/server                   Relay
@types/node                    22.20.1  22.20.5   26.6.4  node_modules/@types/node                    Relay
@types/react                   19.2.17   19.3.0   19.3.0  node_modules/@types/react                   Relay
@upstash/ratelimit               2.0.8    2.2.0    2.2.0  node_modules/@upstash/ratelimit             Relay
@upstash/redis                  1.38.0   1.39.0   1.39.0  node_modules/@upstash/redis                 Relay
autoprefixer                    10.5.4   10.6.1   10.6.1  node_modules/autoprefixer                   Relay
eslint                          9.39.5   9.39.5  10.12.0  node_modules/eslint                         Relay
eslint-config-next             15.5.21  15.5.27   16.4.0  node_modules/eslint-config-next             Relay
framer-motion                  11.18.2  11.18.2   14.0.0  node_modules/framer-motion                  Relay
lucide-react                   0.468.0  0.468.0   1.53.0  node_modules/lucide-react                   Relay
next                           15.5.21  15.5.27   16.4.0  node_modules/next                           Relay
openai                         4.104.0  4.104.0   6.49.0  node_modules/openai                         Relay
postcss                         8.5.22   8.5.29   8.5.29  node_modules/postcss                        Relay
prisma                          6.19.3   6.19.3   7.10.0  node_modules/prisma                         Relay
react                           19.2.8   19.3.0   19.3.0  node_modules/react                          Relay
react-dom                       19.2.8   19.3.0   19.3.0  node_modules/react-dom                      Relay
react-hook-form                 7.82.0   7.89.0   7.89.0  node_modules/react-hook-form                Relay
recharts                        2.15.4   2.15.4   3.10.1  node_modules/recharts                       Relay
resend                           4.8.0    4.8.0   6.32.1  node_modules/resend                         Relay
stripe                          17.7.0   17.7.0   23.0.0  node_modules/stripe                         Relay
svix                            1.98.0   1.99.1   1.99.1  node_modules/svix                           Relay
tailwind-merge                   2.6.1    2.6.1    3.7.0  node_modules/tailwind-merge                 Relay
tailwindcss                     3.4.19   3.4.19    4.3.3  node_modules/tailwindcss                    Relay
tsx                             4.23.1  4.23.15  4.23.15  node_modules/tsx                            Relay
typescript                       5.9.3    5.9.3    7.0.2  node_modules/typescript                     Relay
vitest                           2.1.9    2.1.9   4.1.11  node_modules/vitest                         Relay
zod                            3.25.76  3.25.76    4.6.5  node_modules/zod                            Relay
```

### 2026-10-08 — typecheck/test status: pass

### 2026-10-12 — dependency freshness
```
Package                        Current   Wanted   Latest  Location                                    Depended by
@anthropic-ai/sdk               0.30.1   0.30.1  0.133.0  node_modules/@anthropic-ai/sdk              Relay
@clerk/nextjs                   6.39.6   6.39.7   7.9.14  node_modules/@clerk/nextjs                  Relay
@hookform/resolvers             3.10.0   3.10.0    5.9.1  node_modules/@hookform/resolvers            Relay
@playwright/test                1.61.1   1.64.0   1.64.0  node_modules/@playwright/test               Relay
@prisma/client                  6.19.3   6.19.3   7.10.0  node_modules/@prisma/client                 Relay
@radix-ui/react-dialog          1.1.20    1.3.1    1.3.1  node_modules/@radix-ui/react-dialog         Relay
@radix-ui/react-dropdown-menu   2.1.21    2.2.1    2.2.1  node_modules/@radix-ui/react-dropdown-menu  Relay
@radix-ui/react-popover         1.1.20    1.3.1    1.3.1  node_modules/@radix-ui/react-popover        Relay
@radix-ui/react-select           2.3.4    2.4.1    2.4.1  node_modules/@radix-ui/react-select         Relay
@radix-ui/react-tabs            1.1.18    1.2.1    1.2.1  node_modules/@radix-ui/react-tabs           Relay
@radix-ui/react-toast           1.2.20    1.3.1    1.3.1  node_modules/@radix-ui/react-toast          Relay
@react-pdf/renderer              4.5.1    4.9.0    4.9.0  node_modules/@react-pdf/renderer            Relay
@tanstack/react-query          5.101.4  5.104.2  5.104.2  node_modules/@tanstack/react-query          Relay
@tanstack/react-table           8.21.3   8.21.3    9.3.1  node_modules/@tanstack/react-table          Relay
@trpc/client                   11.18.0  11.19.0  11.19.0  node_modules/@trpc/client                   Relay
@trpc/react-query              11.18.0  11.19.0  11.19.0  node_modules/@trpc/react-query              Relay
@trpc/server                   11.18.0  11.19.0  11.19.0  node_modules/@trpc/server                   Relay
@types/node                    22.20.1  22.20.5   26.6.5  node_modules/@types/node                    Relay
@types/react                   19.2.17   19.3.0   19.3.0  node_modules/@types/react                   Relay
@upstash/ratelimit               2.0.8    2.2.0    2.2.0  node_modules/@upstash/ratelimit             Relay
@upstash/redis                  1.38.0   1.39.0   1.39.0  node_modules/@upstash/redis                 Relay
autoprefixer                    10.5.4   10.6.1   10.6.1  node_modules/autoprefixer                   Relay
eslint                          9.39.5   9.39.5  10.12.0  node_modules/eslint                         Relay
eslint-config-next             15.5.21  15.5.27   16.4.0  node_modules/eslint-config-next             Relay
framer-motion                  11.18.2  11.18.2   14.1.0  node_modules/framer-motion                  Relay
lucide-react                   0.468.0  0.468.0   1.55.0  node_modules/lucide-react                   Relay
next                           15.5.21  15.5.27   16.4.0  node_modules/next                           Relay
openai                         4.104.0  4.104.0   6.49.0  node_modules/openai                         Relay
postcss                         8.5.22   8.5.30   8.5.30  node_modules/postcss                        Relay
prisma                          6.19.3   6.19.3   7.10.0  node_modules/prisma                         Relay
react                           19.2.8   19.3.0   19.3.0  node_modules/react                          Relay
react-dom                       19.2.8   19.3.0   19.3.0  node_modules/react-dom                      Relay
react-hook-form                 7.82.0   7.90.0   7.90.0  node_modules/react-hook-form                Relay
recharts                        2.15.4   2.15.4   3.10.1  node_modules/recharts                       Relay
resend                           4.8.0    4.8.0   6.32.1  node_modules/resend                         Relay
stripe                          17.7.0   17.7.0   23.0.0  node_modules/stripe                         Relay
svix                            1.98.0   1.99.1   1.99.1  node_modules/svix                           Relay
tailwind-merge                   2.6.1    2.6.1    3.7.0  node_modules/tailwind-merge                 Relay
tailwindcss                     3.4.19   3.4.19    4.3.3  node_modules/tailwindcss                    Relay
tsx                             4.23.1  4.23.15  4.23.15  node_modules/tsx                            Relay
typescript                       5.9.3    5.9.3    7.0.2  node_modules/typescript                     Relay
vitest                           2.1.9    2.1.9   4.1.11  node_modules/vitest                         Relay
zod                            3.25.76  3.25.76    4.6.7  node_modules/zod                            Relay
```

### 2026-10-12 — typecheck/test status: pass

### 2026-10-13 — dependency freshness
```
Package                        Current   Wanted   Latest  Location                                    Depended by
@anthropic-ai/sdk               0.30.1   0.30.1  0.133.0  node_modules/@anthropic-ai/sdk              Relay
@clerk/nextjs                   6.39.6   6.39.7   7.9.15  node_modules/@clerk/nextjs                  Relay
@hookform/resolvers             3.10.0   3.10.0    5.9.1  node_modules/@hookform/resolvers            Relay
@playwright/test                1.61.1   1.64.0   1.64.0  node_modules/@playwright/test               Relay
@prisma/client                  6.19.3   6.19.3   7.10.0  node_modules/@prisma/client                 Relay
@radix-ui/react-dialog          1.1.20    1.3.1    1.3.1  node_modules/@radix-ui/react-dialog         Relay
@radix-ui/react-dropdown-menu   2.1.21    2.2.1    2.2.1  node_modules/@radix-ui/react-dropdown-menu  Relay
@radix-ui/react-popover         1.1.20    1.3.1    1.3.1  node_modules/@radix-ui/react-popover        Relay
@radix-ui/react-select           2.3.4    2.4.1    2.4.1  node_modules/@radix-ui/react-select         Relay
@radix-ui/react-tabs            1.1.18    1.2.1    1.2.1  node_modules/@radix-ui/react-tabs           Relay
@radix-ui/react-toast           1.2.20    1.3.1    1.3.1  node_modules/@radix-ui/react-toast          Relay
@react-pdf/renderer              4.5.1    4.9.0    4.9.0  node_modules/@react-pdf/renderer            Relay
@tanstack/react-query          5.101.4  5.104.2  5.104.2  node_modules/@tanstack/react-query          Relay
@tanstack/react-table           8.21.3   8.21.3    9.3.1  node_modules/@tanstack/react-table          Relay
@trpc/client                   11.18.0  11.19.0  11.19.0  node_modules/@trpc/client                   Relay
@trpc/react-query              11.18.0  11.19.0  11.19.0  node_modules/@trpc/react-query              Relay
@trpc/server                   11.18.0  11.19.0  11.19.0  node_modules/@trpc/server                   Relay
@types/node                    22.20.1  22.20.5   26.6.5  node_modules/@types/node                    Relay
@types/react                   19.2.17   19.3.0   19.3.0  node_modules/@types/react                   Relay
@upstash/ratelimit               2.0.8    2.2.0    2.2.0  node_modules/@upstash/ratelimit             Relay
@upstash/redis                  1.38.0   1.39.0   1.39.0  node_modules/@upstash/redis                 Relay
autoprefixer                    10.5.4   10.6.1   10.6.1  node_modules/autoprefixer                   Relay
eslint                          9.39.5   9.39.5  10.12.0  node_modules/eslint                         Relay
eslint-config-next             15.5.21  15.5.27   16.4.0  node_modules/eslint-config-next             Relay
framer-motion                  11.18.2  11.18.2   14.2.0  node_modules/framer-motion                  Relay
lucide-react                   0.468.0  0.468.0   1.56.0  node_modules/lucide-react                   Relay
next                           15.5.21  15.5.27   16.4.0  node_modules/next                           Relay
openai                         4.104.0  4.104.0   6.49.0  node_modules/openai                         Relay
postcss                         8.5.22   8.5.30   8.5.30  node_modules/postcss                        Relay
prisma                          6.19.3   6.19.3   7.10.0  node_modules/prisma                         Relay
react                           19.2.8   19.3.0   19.3.0  node_modules/react                          Relay
react-dom                       19.2.8   19.3.0   19.3.0  node_modules/react-dom                      Relay
react-hook-form                 7.82.0   7.90.0   7.90.0  node_modules/react-hook-form                Relay
recharts                        2.15.4   2.15.4   3.10.1  node_modules/recharts                       Relay
resend                           4.8.0    4.8.0   6.32.1  node_modules/resend                         Relay
stripe                          17.7.0   17.7.0   23.0.0  node_modules/stripe                         Relay
svix                            1.98.0   1.99.1   1.99.1  node_modules/svix                           Relay
tailwind-merge                   2.6.1    2.6.1    3.7.0  node_modules/tailwind-merge                 Relay
tailwindcss                     3.4.19   3.4.19    4.3.3  node_modules/tailwindcss                    Relay
tsx                             4.23.1  4.23.15  4.23.15  node_modules/tsx                            Relay
typescript                       5.9.3    5.9.3    7.0.2  node_modules/typescript                     Relay
vitest                           2.1.9    2.1.9   4.1.11  node_modules/vitest                         Relay
zod                            3.25.76  3.25.76    4.6.7  node_modules/zod                            Relay
```

### 2026-10-13 — typecheck/test status: pass

### 2026-10-14 — dependency freshness
```
Package                        Current   Wanted   Latest  Location                                    Depended by
@anthropic-ai/sdk               0.30.1   0.30.1  0.134.0  node_modules/@anthropic-ai/sdk              Relay
@clerk/nextjs                   6.39.6   6.39.7   7.9.15  node_modules/@clerk/nextjs                  Relay
@hookform/resolvers             3.10.0   3.10.0    5.9.1  node_modules/@hookform/resolvers            Relay
@playwright/test                1.61.1   1.64.1   1.64.1  node_modules/@playwright/test               Relay
@prisma/client                  6.19.3   6.19.3   7.10.0  node_modules/@prisma/client                 Relay
@radix-ui/react-dialog          1.1.20    1.3.1    1.3.1  node_modules/@radix-ui/react-dialog         Relay
@radix-ui/react-dropdown-menu   2.1.21    2.2.1    2.2.1  node_modules/@radix-ui/react-dropdown-menu  Relay
@radix-ui/react-popover         1.1.20    1.3.1    1.3.1  node_modules/@radix-ui/react-popover        Relay
@radix-ui/react-select           2.3.4    2.4.1    2.4.1  node_modules/@radix-ui/react-select         Relay
@radix-ui/react-tabs            1.1.18    1.2.1    1.2.1  node_modules/@radix-ui/react-tabs           Relay
@radix-ui/react-toast           1.2.20    1.3.1    1.3.1  node_modules/@radix-ui/react-toast          Relay
@react-pdf/renderer              4.5.1    4.9.0    4.9.0  node_modules/@react-pdf/renderer            Relay
@tanstack/react-query          5.101.4  5.104.2  5.104.2  node_modules/@tanstack/react-query          Relay
@tanstack/react-table           8.21.3   8.21.3    9.3.1  node_modules/@tanstack/react-table          Relay
@trpc/client                   11.18.0  11.19.0  11.19.0  node_modules/@trpc/client                   Relay
@trpc/react-query              11.18.0  11.19.0  11.19.0  node_modules/@trpc/react-query              Relay
@trpc/server                   11.18.0  11.19.0  11.19.0  node_modules/@trpc/server                   Relay
@types/node                    22.20.1  22.20.5   26.6.5  node_modules/@types/node                    Relay
@types/react                   19.2.17   19.3.0   19.3.0  node_modules/@types/react                   Relay
@upstash/ratelimit               2.0.8    2.2.0    2.2.0  node_modules/@upstash/ratelimit             Relay
@upstash/redis                  1.38.0   1.39.0   1.39.0  node_modules/@upstash/redis                 Relay
autoprefixer                    10.5.4   10.6.1   10.6.1  node_modules/autoprefixer                   Relay
eslint                          9.39.5   9.39.5  10.12.0  node_modules/eslint                         Relay
eslint-config-next             15.5.21  15.5.28   16.4.1  node_modules/eslint-config-next             Relay
framer-motion                  11.18.2  11.18.2   14.2.0  node_modules/framer-motion                  Relay
lucide-react                   0.468.0  0.468.0   1.57.0  node_modules/lucide-react                   Relay
next                           15.5.21  15.5.28   16.4.1  node_modules/next                           Relay
openai                         4.104.0  4.104.0   6.49.0  node_modules/openai                         Relay
postcss                         8.5.22   8.5.30   8.5.30  node_modules/postcss                        Relay
prisma                          6.19.3   6.19.3   7.10.0  node_modules/prisma                         Relay
react                           19.2.8   19.3.1   19.3.1  node_modules/react                          Relay
react-dom                       19.2.8   19.3.1   19.3.1  node_modules/react-dom                      Relay
react-hook-form                 7.82.0   7.90.0   7.90.0  node_modules/react-hook-form                Relay
recharts                        2.15.4   2.15.4   3.10.1  node_modules/recharts                       Relay
resend                           4.8.0    4.8.0   6.33.0  node_modules/resend                         Relay
stripe                          17.7.0   17.7.0   23.0.0  node_modules/stripe                         Relay
svix                            1.98.0   1.99.1   1.99.1  node_modules/svix                           Relay
tailwind-merge                   2.6.1    2.6.1    3.7.0  node_modules/tailwind-merge                 Relay
tailwindcss                     3.4.19   3.4.19    4.3.3  node_modules/tailwindcss                    Relay
tsx                             4.23.1  4.23.15  4.23.15  node_modules/tsx                            Relay
typescript                       5.9.3    5.9.3    7.0.2  node_modules/typescript                     Relay
vitest                           2.1.9    2.1.9   4.1.11  node_modules/vitest                         Relay
zod                            3.25.76  3.25.76    4.6.7  node_modules/zod                            Relay
```

### 2026-10-14 — typecheck/test status: pass

### 2026-10-16 — dependency freshness
```
Package                        Current   Wanted   Latest  Location                                    Depended by
@anthropic-ai/sdk               0.30.1   0.30.1  0.135.0  node_modules/@anthropic-ai/sdk              Relay
@clerk/nextjs                   6.39.6   6.39.7   7.9.17  node_modules/@clerk/nextjs                  Relay
@hookform/resolvers             3.10.0   3.10.0    5.9.1  node_modules/@hookform/resolvers            Relay
@playwright/test                1.61.1   1.64.1   1.64.1  node_modules/@playwright/test               Relay
@prisma/client                  6.19.3   6.19.3   7.10.1  node_modules/@prisma/client                 Relay
@radix-ui/react-dialog          1.1.20    1.3.1    1.3.1  node_modules/@radix-ui/react-dialog         Relay
@radix-ui/react-dropdown-menu   2.1.21    2.2.1    2.2.1  node_modules/@radix-ui/react-dropdown-menu  Relay
@radix-ui/react-popover         1.1.20    1.3.1    1.3.1  node_modules/@radix-ui/react-popover        Relay
@radix-ui/react-select           2.3.4    2.4.1    2.4.1  node_modules/@radix-ui/react-select         Relay
@radix-ui/react-tabs            1.1.18    1.2.1    1.2.1  node_modules/@radix-ui/react-tabs           Relay
@radix-ui/react-toast           1.2.20    1.3.1    1.3.1  node_modules/@radix-ui/react-toast          Relay
@react-pdf/renderer              4.5.1    4.9.0    4.9.0  node_modules/@react-pdf/renderer            Relay
@tanstack/react-query          5.101.4  5.104.3  5.104.3  node_modules/@tanstack/react-query          Relay
@tanstack/react-table           8.21.3   8.21.3    9.3.1  node_modules/@tanstack/react-table          Relay
@trpc/client                   11.18.0  11.19.0  11.19.0  node_modules/@trpc/client                   Relay
@trpc/react-query              11.18.0  11.19.0  11.19.0  node_modules/@trpc/react-query              Relay
@trpc/server                   11.18.0  11.19.0  11.19.0  node_modules/@trpc/server                   Relay
@types/node                    22.20.1  22.20.5   26.6.5  node_modules/@types/node                    Relay
@types/react                   19.2.17   19.3.0   19.3.0  node_modules/@types/react                   Relay
@upstash/ratelimit               2.0.8    2.2.0    2.2.0  node_modules/@upstash/ratelimit             Relay
@upstash/redis                  1.38.0   1.39.0   1.39.0  node_modules/@upstash/redis                 Relay
autoprefixer                    10.5.4   10.6.1   10.6.1  node_modules/autoprefixer                   Relay
eslint                          9.39.5   9.39.5  10.13.0  node_modules/eslint                         Relay
eslint-config-next             15.5.21  15.5.28   16.4.2  node_modules/eslint-config-next             Relay
framer-motion                  11.18.2  11.18.2   14.3.0  node_modules/framer-motion                  Relay
lucide-react                   0.468.0  0.468.0   1.58.0  node_modules/lucide-react                   Relay
next                           15.5.21  15.5.28   16.4.2  node_modules/next                           Relay
openai                         4.104.0  4.104.0   6.49.0  node_modules/openai                         Relay
postcss                         8.5.22   8.5.30   8.5.30  node_modules/postcss                        Relay
prisma                          6.19.3   6.19.3   7.10.1  node_modules/prisma                         Relay
react                           19.2.8   19.3.1   19.3.1  node_modules/react                          Relay
react-dom                       19.2.8   19.3.1   19.3.1  node_modules/react-dom                      Relay
react-hook-form                 7.82.0   7.90.0   7.90.0  node_modules/react-hook-form                Relay
recharts                        2.15.4   2.15.4   3.10.1  node_modules/recharts                       Relay
resend                           4.8.0    4.8.0   6.34.1  node_modules/resend                         Relay
stripe                          17.7.0   17.7.0   23.0.0  node_modules/stripe                         Relay
svix                            1.98.0   1.99.1   1.99.1  node_modules/svix                           Relay
tailwind-merge                   2.6.1    2.6.1    3.7.0  node_modules/tailwind-merge                 Relay
tailwindcss                     3.4.19   3.4.19    4.3.3  node_modules/tailwindcss                    Relay
tsx                             4.23.1  4.23.15  4.23.15  node_modules/tsx                            Relay
typescript                       5.9.3    5.9.3    7.0.2  node_modules/typescript                     Relay
vitest                           2.1.9    2.1.9   4.1.12  node_modules/vitest                         Relay
zod                            3.25.76  3.25.76    4.6.7  node_modules/zod                            Relay
```

### 2026-10-16 — typecheck/test status: pass

### 2026-10-19 — dependency freshness
```
Package                        Current   Wanted   Latest  Location                                    Depended by
@anthropic-ai/sdk               0.30.1   0.30.1  0.135.0  node_modules/@anthropic-ai/sdk              Relay
@clerk/nextjs                   6.39.6   6.39.7   7.9.17  node_modules/@clerk/nextjs                  Relay
@hookform/resolvers             3.10.0   3.10.0    6.0.0  node_modules/@hookform/resolvers            Relay
@playwright/test                1.61.1   1.64.1   1.64.1  node_modules/@playwright/test               Relay
@prisma/client                  6.19.3   6.19.3   7.10.1  node_modules/@prisma/client                 Relay
@radix-ui/react-dialog          1.1.20    1.3.1    1.3.1  node_modules/@radix-ui/react-dialog         Relay
@radix-ui/react-dropdown-menu   2.1.21    2.2.1    2.2.1  node_modules/@radix-ui/react-dropdown-menu  Relay
@radix-ui/react-popover         1.1.20    1.3.1    1.3.1  node_modules/@radix-ui/react-popover        Relay
@radix-ui/react-select           2.3.4    2.4.1    2.4.1  node_modules/@radix-ui/react-select         Relay
@radix-ui/react-tabs            1.1.18    1.2.1    1.2.1  node_modules/@radix-ui/react-tabs           Relay
@radix-ui/react-toast           1.2.20    1.3.1    1.3.1  node_modules/@radix-ui/react-toast          Relay
@react-pdf/renderer              4.5.1    4.9.0    4.9.0  node_modules/@react-pdf/renderer            Relay
@tanstack/react-query          5.101.4  5.104.5  5.104.5  node_modules/@tanstack/react-query          Relay
@tanstack/react-table           8.21.3   8.21.3    9.3.1  node_modules/@tanstack/react-table          Relay
@trpc/client                   11.18.0  11.19.0  11.19.0  node_modules/@trpc/client                   Relay
@trpc/react-query              11.18.0  11.19.0  11.19.0  node_modules/@trpc/react-query              Relay
@trpc/server                   11.18.0  11.19.0  11.19.0  node_modules/@trpc/server                   Relay
@types/node                    22.20.1  22.20.5   26.6.5  node_modules/@types/node                    Relay
@types/react                   19.2.17   19.3.0   19.3.0  node_modules/@types/react                   Relay
@upstash/ratelimit               2.0.8    2.2.0    2.2.0  node_modules/@upstash/ratelimit             Relay
@upstash/redis                  1.38.0   1.39.0   1.39.0  node_modules/@upstash/redis                 Relay
autoprefixer                    10.5.4   10.6.1   10.6.1  node_modules/autoprefixer                   Relay
eslint                          9.39.5   9.39.5  10.13.0  node_modules/eslint                         Relay
eslint-config-next             15.5.21  15.5.28   16.4.2  node_modules/eslint-config-next             Relay
framer-motion                  11.18.2  11.18.2   14.4.0  node_modules/framer-motion                  Relay
lucide-react                   0.468.0  0.468.0   1.59.0  node_modules/lucide-react                   Relay
next                           15.5.21  15.5.28   16.4.2  node_modules/next                           Relay
openai                         4.104.0  4.104.0   6.49.0  node_modules/openai                         Relay
postcss                         8.5.22   8.5.31   8.5.31  node_modules/postcss                        Relay
prisma                          6.19.3   6.19.3   7.10.1  node_modules/prisma                         Relay
react                           19.2.8   19.3.1   19.3.1  node_modules/react                          Relay
react-dom                       19.2.8   19.3.1   19.3.1  node_modules/react-dom                      Relay
react-hook-form                 7.82.0   7.90.0   7.90.0  node_modules/react-hook-form                Relay
recharts                        2.15.4   2.15.4   3.10.1  node_modules/recharts                       Relay
resend                           4.8.0    4.8.0   6.34.1  node_modules/resend                         Relay
stripe                          17.7.0   17.7.0   23.0.0  node_modules/stripe                         Relay
svix                            1.98.0   1.99.1   1.99.1  node_modules/svix                           Relay
tailwind-merge                   2.6.1    2.6.1    3.7.0  node_modules/tailwind-merge                 Relay
tailwindcss                     3.4.19   3.4.19    4.3.3  node_modules/tailwindcss                    Relay
tsx                             4.23.1  4.23.15  4.23.15  node_modules/tsx                            Relay
typescript                       5.9.3    5.9.3    7.0.2  node_modules/typescript                     Relay
vitest                           2.1.9    2.1.9   4.1.12  node_modules/vitest                         Relay
zod                            3.25.76  3.25.76    4.6.7  node_modules/zod                            Relay
```

### 2026-10-19 — typecheck/test status: pass

### 2026-10-20 — dependency freshness
```
Package                        Current   Wanted   Latest  Location                                    Depended by
@anthropic-ai/sdk               0.30.1   0.30.1  0.136.0  node_modules/@anthropic-ai/sdk              Relay
@clerk/nextjs                   6.39.6   6.39.8   7.9.18  node_modules/@clerk/nextjs                  Relay
@hookform/resolvers             3.10.0   3.10.0    6.0.0  node_modules/@hookform/resolvers            Relay
@playwright/test                1.61.1   1.64.1   1.64.1  node_modules/@playwright/test               Relay
@prisma/client                  6.19.3   6.19.3   7.10.1  node_modules/@prisma/client                 Relay
@radix-ui/react-dialog          1.1.20    1.3.1    1.3.1  node_modules/@radix-ui/react-dialog         Relay
@radix-ui/react-dropdown-menu   2.1.21    2.2.1    2.2.1  node_modules/@radix-ui/react-dropdown-menu  Relay
@radix-ui/react-popover         1.1.20    1.3.1    1.3.1  node_modules/@radix-ui/react-popover        Relay
@radix-ui/react-select           2.3.4    2.4.1    2.4.1  node_modules/@radix-ui/react-select         Relay
@radix-ui/react-tabs            1.1.18    1.2.1    1.2.1  node_modules/@radix-ui/react-tabs           Relay
@radix-ui/react-toast           1.2.20    1.3.1    1.3.1  node_modules/@radix-ui/react-toast          Relay
@react-pdf/renderer              4.5.1    4.9.0    4.9.0  node_modules/@react-pdf/renderer            Relay
@tanstack/react-query          5.101.4  5.104.5  5.104.5  node_modules/@tanstack/react-query          Relay
@tanstack/react-table           8.21.3   8.21.3    9.3.1  node_modules/@tanstack/react-table          Relay
@trpc/client                   11.18.0  11.19.0  11.19.0  node_modules/@trpc/client                   Relay
@trpc/react-query              11.18.0  11.19.0  11.19.0  node_modules/@trpc/react-query              Relay
@trpc/server                   11.18.0  11.19.0  11.19.0  node_modules/@trpc/server                   Relay
@types/node                    22.20.1  22.20.5   26.6.5  node_modules/@types/node                    Relay
@types/react                   19.2.17   19.3.0   19.3.0  node_modules/@types/react                   Relay
@upstash/ratelimit               2.0.8    2.2.0    2.2.0  node_modules/@upstash/ratelimit             Relay
@upstash/redis                  1.38.0   1.39.0   1.39.0  node_modules/@upstash/redis                 Relay
autoprefixer                    10.5.4   10.6.1   10.6.1  node_modules/autoprefixer                   Relay
eslint                          9.39.5   9.39.5  10.13.0  node_modules/eslint                         Relay
eslint-config-next             15.5.21  15.5.28   16.4.2  node_modules/eslint-config-next             Relay
framer-motion                  11.18.2  11.18.2   14.4.0  node_modules/framer-motion                  Relay
lucide-react                   0.468.0  0.468.0   1.60.0  node_modules/lucide-react                   Relay
next                           15.5.21  15.5.28   16.4.2  node_modules/next                           Relay
openai                         4.104.0  4.104.0   6.49.0  node_modules/openai                         Relay
postcss                         8.5.22   8.5.31   8.5.31  node_modules/postcss                        Relay
prisma                          6.19.3   6.19.3   7.10.1  node_modules/prisma                         Relay
react                           19.2.8   19.3.1   19.3.1  node_modules/react                          Relay
react-dom                       19.2.8   19.3.1   19.3.1  node_modules/react-dom                      Relay
react-hook-form                 7.82.0   7.90.0   7.90.0  node_modules/react-hook-form                Relay
recharts                        2.15.4   2.15.4   3.10.1  node_modules/recharts                       Relay
resend                           4.8.0    4.8.0   6.34.1  node_modules/resend                         Relay
stripe                          17.7.0   17.7.0   23.0.0  node_modules/stripe                         Relay
svix                            1.98.0   1.99.1   1.99.1  node_modules/svix                           Relay
tailwind-merge                   2.6.1    2.6.1    3.7.0  node_modules/tailwind-merge                 Relay
tailwindcss                     3.4.19   3.4.19    4.3.3  node_modules/tailwindcss                    Relay
tsx                             4.23.1  4.23.15  4.23.15  node_modules/tsx                            Relay
typescript                       5.9.3    5.9.3    7.0.2  node_modules/typescript                     Relay
vitest                           2.1.9    2.1.9   4.1.12  node_modules/vitest                         Relay
zod                            3.25.76  3.25.76    4.6.7  node_modules/zod                            Relay
```

### 2026-10-20 — typecheck/test status: pass

### 2026-10-21 — dependency freshness
```
Package                        Current   Wanted   Latest  Location                                    Depended by
@anthropic-ai/sdk               0.30.1   0.30.1    1.0.0  node_modules/@anthropic-ai/sdk              Relay
@clerk/nextjs                   6.39.6   6.39.8   7.9.19  node_modules/@clerk/nextjs                  Relay
@hookform/resolvers             3.10.0   3.10.0    6.0.0  node_modules/@hookform/resolvers            Relay
@playwright/test                1.61.1   1.64.1   1.64.1  node_modules/@playwright/test               Relay
@prisma/client                  6.19.3   6.19.3   7.10.1  node_modules/@prisma/client                 Relay
@radix-ui/react-dialog          1.1.20    1.3.1    1.3.1  node_modules/@radix-ui/react-dialog         Relay
@radix-ui/react-dropdown-menu   2.1.21    2.2.1    2.2.1  node_modules/@radix-ui/react-dropdown-menu  Relay
@radix-ui/react-popover         1.1.20    1.3.1    1.3.1  node_modules/@radix-ui/react-popover        Relay
@radix-ui/react-select           2.3.4    2.4.1    2.4.1  node_modules/@radix-ui/react-select         Relay
@radix-ui/react-tabs            1.1.18    1.2.1    1.2.1  node_modules/@radix-ui/react-tabs           Relay
@radix-ui/react-toast           1.2.20    1.3.1    1.3.1  node_modules/@radix-ui/react-toast          Relay
@react-pdf/renderer              4.5.1    4.9.0    4.9.0  node_modules/@react-pdf/renderer            Relay
@tanstack/react-query          5.101.4  5.104.5  5.104.5  node_modules/@tanstack/react-query          Relay
@tanstack/react-table           8.21.3   8.21.3    9.3.1  node_modules/@tanstack/react-table          Relay
@trpc/client                   11.18.0  11.19.0  11.19.0  node_modules/@trpc/client                   Relay
@trpc/react-query              11.18.0  11.19.0  11.19.0  node_modules/@trpc/react-query              Relay
@trpc/server                   11.18.0  11.19.0  11.19.0  node_modules/@trpc/server                   Relay
@types/node                    22.20.1  22.20.5   26.6.5  node_modules/@types/node                    Relay
@types/react                   19.2.17   19.3.0   19.3.0  node_modules/@types/react                   Relay
@upstash/ratelimit               2.0.8    2.2.0    2.2.0  node_modules/@upstash/ratelimit             Relay
@upstash/redis                  1.38.0   1.39.0   1.39.0  node_modules/@upstash/redis                 Relay
autoprefixer                    10.5.4   10.6.1   10.6.1  node_modules/autoprefixer                   Relay
eslint                          9.39.5   9.39.5  10.13.0  node_modules/eslint                         Relay
eslint-config-next             15.5.21  15.5.28   16.4.2  node_modules/eslint-config-next             Relay
framer-motion                  11.18.2  11.18.2   14.5.0  node_modules/framer-motion                  Relay
lucide-react                   0.468.0  0.468.0   1.61.0  node_modules/lucide-react                   Relay
next                           15.5.21  15.5.28   16.4.2  node_modules/next                           Relay
openai                         4.104.0  4.104.0   6.49.0  node_modules/openai                         Relay
postcss                         8.5.22   8.5.31   8.5.31  node_modules/postcss                        Relay
prisma                          6.19.3   6.19.3   7.10.1  node_modules/prisma                         Relay
react                           19.2.8   19.3.1   19.3.1  node_modules/react                          Relay
react-dom                       19.2.8   19.3.1   19.3.1  node_modules/react-dom                      Relay
react-hook-form                 7.82.0   7.90.0   7.90.0  node_modules/react-hook-form                Relay
recharts                        2.15.4   2.15.4   3.10.1  node_modules/recharts                       Relay
resend                           4.8.0    4.8.0   6.34.1  node_modules/resend                         Relay
stripe                          17.7.0   17.7.0   23.0.0  node_modules/stripe                         Relay
svix                            1.98.0   1.99.1   1.99.1  node_modules/svix                           Relay
tailwind-merge                   2.6.1    2.6.1    3.7.0  node_modules/tailwind-merge                 Relay
tailwindcss                     3.4.19   3.4.19    4.3.3  node_modules/tailwindcss                    Relay
tsx                             4.23.1  4.23.15  4.23.15  node_modules/tsx                            Relay
typescript                       5.9.3    5.9.3    7.0.2  node_modules/typescript                     Relay
vitest                           2.1.9    2.1.9   4.1.12  node_modules/vitest                         Relay
zod                            3.25.76  3.25.76    4.6.7  node_modules/zod                            Relay
```

### 2026-10-21 — typecheck/test status: pass

### 2026-10-22 — dependency freshness
```
Package                        Current   Wanted   Latest  Location                                    Depended by
@anthropic-ai/sdk               0.30.1   0.30.1    1.1.0  node_modules/@anthropic-ai/sdk              Relay
@clerk/nextjs                   6.39.6   6.39.8   7.9.19  node_modules/@clerk/nextjs                  Relay
@hookform/resolvers             3.10.0   3.10.0    6.0.0  node_modules/@hookform/resolvers            Relay
@playwright/test                1.61.1   1.64.1   1.64.1  node_modules/@playwright/test               Relay
@prisma/client                  6.19.3   6.19.3   7.10.1  node_modules/@prisma/client                 Relay
@radix-ui/react-dialog          1.1.20    1.3.1    1.3.1  node_modules/@radix-ui/react-dialog         Relay
@radix-ui/react-dropdown-menu   2.1.21    2.2.1    2.2.1  node_modules/@radix-ui/react-dropdown-menu  Relay
@radix-ui/react-popover         1.1.20    1.3.1    1.3.1  node_modules/@radix-ui/react-popover        Relay
@radix-ui/react-select           2.3.4    2.4.1    2.4.1  node_modules/@radix-ui/react-select         Relay
@radix-ui/react-tabs            1.1.18    1.2.1    1.2.1  node_modules/@radix-ui/react-tabs           Relay
@radix-ui/react-toast           1.2.20    1.3.1    1.3.1  node_modules/@radix-ui/react-toast          Relay
@react-pdf/renderer              4.5.1    4.9.0    4.9.0  node_modules/@react-pdf/renderer            Relay
@tanstack/react-query          5.101.4  5.104.5  5.104.5  node_modules/@tanstack/react-query          Relay
@tanstack/react-table           8.21.3   8.21.3    9.3.1  node_modules/@tanstack/react-table          Relay
@trpc/client                   11.18.0  11.19.0  11.19.0  node_modules/@trpc/client                   Relay
@trpc/react-query              11.18.0  11.19.0  11.19.0  node_modules/@trpc/react-query              Relay
@trpc/server                   11.18.0  11.19.0  11.19.0  node_modules/@trpc/server                   Relay
@types/node                    22.20.1  22.20.5   26.6.5  node_modules/@types/node                    Relay
@types/react                   19.2.17   19.3.0   19.3.0  node_modules/@types/react                   Relay
@upstash/ratelimit               2.0.8    2.2.0    2.2.0  node_modules/@upstash/ratelimit             Relay
@upstash/redis                  1.38.0   1.39.0   1.39.0  node_modules/@upstash/redis                 Relay
autoprefixer                    10.5.4   10.6.1   10.6.1  node_modules/autoprefixer                   Relay
eslint                          9.39.5   9.39.5  10.13.0  node_modules/eslint                         Relay
eslint-config-next             15.5.21  15.5.28   16.4.2  node_modules/eslint-config-next             Relay
framer-motion                  11.18.2  11.18.2   14.6.0  node_modules/framer-motion                  Relay
lucide-react                   0.468.0  0.468.0   1.61.0  node_modules/lucide-react                   Relay
next                           15.5.21  15.5.28   16.4.2  node_modules/next                           Relay
openai                         4.104.0  4.104.0   6.49.0  node_modules/openai                         Relay
postcss                         8.5.22   8.5.31   8.5.31  node_modules/postcss                        Relay
prisma                          6.19.3   6.19.3   7.10.1  node_modules/prisma                         Relay
react                           19.2.8   19.3.1   19.3.1  node_modules/react                          Relay
react-dom                       19.2.8   19.3.1   19.3.1  node_modules/react-dom                      Relay
react-hook-form                 7.82.0   7.90.0   7.90.0  node_modules/react-hook-form                Relay
recharts                        2.15.4   2.15.4   3.10.1  node_modules/recharts                       Relay
resend                           4.8.0    4.8.0   6.34.1  node_modules/resend                         Relay
stripe                          17.7.0   17.7.0   23.0.1  node_modules/stripe                         Relay
svix                            1.98.0   1.99.1   1.99.1  node_modules/svix                           Relay
tailwind-merge                   2.6.1    2.6.1    3.7.0  node_modules/tailwind-merge                 Relay
tailwindcss                     3.4.19   3.4.19    4.3.3  node_modules/tailwindcss                    Relay
tsx                             4.23.1  4.23.15  4.23.15  node_modules/tsx                            Relay
typescript                       5.9.3    5.9.3    7.0.2  node_modules/typescript                     Relay
vitest                           2.1.9    2.1.9   4.1.12  node_modules/vitest                         Relay
zod                            3.25.76  3.25.76    4.6.7  node_modules/zod                            Relay
```

### 2026-10-22 — typecheck/test status: pass

### 2026-10-23 — dependency freshness
```
Package                        Current   Wanted   Latest  Location                                    Depended by
@anthropic-ai/sdk               0.30.1   0.30.1    1.2.0  node_modules/@anthropic-ai/sdk              Relay
@clerk/nextjs                   6.39.6   6.39.8   7.9.20  node_modules/@clerk/nextjs                  Relay
@hookform/resolvers             3.10.0   3.10.0    6.0.0  node_modules/@hookform/resolvers            Relay
@playwright/test                1.61.1   1.64.1   1.64.1  node_modules/@playwright/test               Relay
@prisma/client                  6.19.3   6.19.3   7.10.1  node_modules/@prisma/client                 Relay
@radix-ui/react-dialog          1.1.20    1.3.1    1.3.1  node_modules/@radix-ui/react-dialog         Relay
@radix-ui/react-dropdown-menu   2.1.21    2.2.1    2.2.1  node_modules/@radix-ui/react-dropdown-menu  Relay
@radix-ui/react-popover         1.1.20    1.3.1    1.3.1  node_modules/@radix-ui/react-popover        Relay
@radix-ui/react-select           2.3.4    2.4.1    2.4.1  node_modules/@radix-ui/react-select         Relay
@radix-ui/react-tabs            1.1.18    1.2.1    1.2.1  node_modules/@radix-ui/react-tabs           Relay
@radix-ui/react-toast           1.2.20    1.3.1    1.3.1  node_modules/@radix-ui/react-toast          Relay
@react-pdf/renderer              4.5.1    4.9.0    4.9.0  node_modules/@react-pdf/renderer            Relay
@tanstack/react-query          5.101.4  5.104.5  5.104.5  node_modules/@tanstack/react-query          Relay
@tanstack/react-table           8.21.3   8.21.3    9.3.1  node_modules/@tanstack/react-table          Relay
@trpc/client                   11.18.0  11.19.0  11.19.0  node_modules/@trpc/client                   Relay
@trpc/react-query              11.18.0  11.19.0  11.19.0  node_modules/@trpc/react-query              Relay
@trpc/server                   11.18.0  11.19.0  11.19.0  node_modules/@trpc/server                   Relay
@types/node                    22.20.1  22.20.5   26.6.5  node_modules/@types/node                    Relay
@types/react                   19.2.17   19.3.0   19.3.0  node_modules/@types/react                   Relay
@upstash/ratelimit               2.0.8    2.2.0    2.2.0  node_modules/@upstash/ratelimit             Relay
@upstash/redis                  1.38.0   1.39.0   1.39.0  node_modules/@upstash/redis                 Relay
autoprefixer                    10.5.4   10.6.1   10.6.1  node_modules/autoprefixer                   Relay
eslint                          9.39.5   9.39.5  10.13.0  node_modules/eslint                         Relay
eslint-config-next             15.5.21  15.5.28   16.4.3  node_modules/eslint-config-next             Relay
framer-motion                  11.18.2  11.18.2   14.6.0  node_modules/framer-motion                  Relay
lucide-react                   0.468.0  0.468.0   1.61.0  node_modules/lucide-react                   Relay
next                           15.5.21  15.5.28   16.4.3  node_modules/next                           Relay
openai                         4.104.0  4.104.0   6.49.0  node_modules/openai                         Relay
postcss                         8.5.22   8.5.31   8.5.31  node_modules/postcss                        Relay
prisma                          6.19.3   6.19.3   7.10.1  node_modules/prisma                         Relay
react                           19.2.8   19.3.1   19.3.1  node_modules/react                          Relay
react-dom                       19.2.8   19.3.1   19.3.1  node_modules/react-dom                      Relay
react-hook-form                 7.82.0   7.90.0   7.90.0  node_modules/react-hook-form                Relay
recharts                        2.15.4   2.15.4   3.10.1  node_modules/recharts                       Relay
resend                           4.8.0    4.8.0   6.34.1  node_modules/resend                         Relay
stripe                          17.7.0   17.7.0   23.0.1  node_modules/stripe                         Relay
svix                            1.98.0   1.99.1   1.99.1  node_modules/svix                           Relay
tailwind-merge                   2.6.1    2.6.1    3.7.0  node_modules/tailwind-merge                 Relay
tailwindcss                     3.4.19   3.4.19    4.3.3  node_modules/tailwindcss                    Relay
tsx                             4.23.1  4.23.15  4.23.15  node_modules/tsx                            Relay
typescript                       5.9.3    5.9.3    7.0.2  node_modules/typescript                     Relay
vitest                           2.1.9    2.1.9   4.1.12  node_modules/vitest                         Relay
zod                            3.25.76  3.25.76    4.6.7  node_modules/zod                            Relay
```

### 2026-10-23 — typecheck/test status: pass

### 2026-10-27 — dependency freshness
```
Package                        Current   Wanted   Latest  Location                                    Depended by
@anthropic-ai/sdk               0.30.1   0.30.1    1.3.0  node_modules/@anthropic-ai/sdk              Relay
@clerk/nextjs                   6.39.6   6.39.8   7.9.21  node_modules/@clerk/nextjs                  Relay
@hookform/resolvers             3.10.0   3.10.0    6.0.1  node_modules/@hookform/resolvers            Relay
@playwright/test                1.61.1   1.64.1   1.64.1  node_modules/@playwright/test               Relay
@prisma/client                  6.19.3   6.19.3   7.10.1  node_modules/@prisma/client                 Relay
@radix-ui/react-dialog          1.1.20    1.3.1    1.3.1  node_modules/@radix-ui/react-dialog         Relay
@radix-ui/react-dropdown-menu   2.1.21    2.2.1    2.2.1  node_modules/@radix-ui/react-dropdown-menu  Relay
@radix-ui/react-popover         1.1.20    1.3.1    1.3.1  node_modules/@radix-ui/react-popover        Relay
@radix-ui/react-select           2.3.4    2.4.1    2.4.1  node_modules/@radix-ui/react-select         Relay
@radix-ui/react-tabs            1.1.18    1.2.1    1.2.1  node_modules/@radix-ui/react-tabs           Relay
@radix-ui/react-toast           1.2.20    1.3.1    1.3.1  node_modules/@radix-ui/react-toast          Relay
@react-pdf/renderer              4.5.1    4.9.0    4.9.0  node_modules/@react-pdf/renderer            Relay
@tanstack/react-query          5.101.4  5.105.0  5.105.0  node_modules/@tanstack/react-query          Relay
@tanstack/react-table           8.21.3   8.21.3    9.3.1  node_modules/@tanstack/react-table          Relay
@trpc/client                   11.18.0  11.19.0  11.19.0  node_modules/@trpc/client                   Relay
@trpc/react-query              11.18.0  11.19.0  11.19.0  node_modules/@trpc/react-query              Relay
@trpc/server                   11.18.0  11.19.0  11.19.0  node_modules/@trpc/server                   Relay
@types/node                    22.20.1  22.20.5   26.6.5  node_modules/@types/node                    Relay
@types/react                   19.2.17   19.3.0   19.3.0  node_modules/@types/react                   Relay
@upstash/ratelimit               2.0.8    2.2.0    2.2.0  node_modules/@upstash/ratelimit             Relay
@upstash/redis                  1.38.0   1.40.0   1.40.0  node_modules/@upstash/redis                 Relay
autoprefixer                    10.5.4   10.6.2   10.6.2  node_modules/autoprefixer                   Relay
eslint                          9.39.5   9.39.5  10.13.0  node_modules/eslint                         Relay
eslint-config-next             15.5.21  15.5.28   16.4.3  node_modules/eslint-config-next             Relay
framer-motion                  11.18.2  11.18.2   14.7.1  node_modules/framer-motion                  Relay
lucide-react                   0.468.0  0.468.0   1.62.0  node_modules/lucide-react                   Relay
next                           15.5.21  15.5.28   16.4.3  node_modules/next                           Relay
openai                         4.104.0  4.104.0   6.49.0  node_modules/openai                         Relay
postcss                         8.5.22   8.5.32   8.5.32  node_modules/postcss                        Relay
prisma                          6.19.3   6.19.3   7.10.1  node_modules/prisma                         Relay
react                           19.2.8   19.3.1   19.3.1  node_modules/react                          Relay
react-dom                       19.2.8   19.3.1   19.3.1  node_modules/react-dom                      Relay
react-hook-form                 7.82.0   7.91.0   7.91.0  node_modules/react-hook-form                Relay
recharts                        2.15.4   2.15.4   3.10.1  node_modules/recharts                       Relay
resend                           4.8.0    4.8.0   6.35.0  node_modules/resend                         Relay
stripe                          17.7.0   17.7.0   23.0.1  node_modules/stripe                         Relay
svix                            1.98.0   1.99.1   1.99.1  node_modules/svix                           Relay
tailwind-merge                   2.6.1    2.6.1    3.7.0  node_modules/tailwind-merge                 Relay
tailwindcss                     3.4.19   3.4.19    4.3.3  node_modules/tailwindcss                    Relay
tsx                             4.23.1  4.23.15  4.23.15  node_modules/tsx                            Relay
typescript                       5.9.3    5.9.3    7.0.2  node_modules/typescript                     Relay
vitest                           2.1.9    2.1.9   4.1.12  node_modules/vitest                         Relay
zod                            3.25.76  3.25.76    4.6.7  node_modules/zod                            Relay
```

### 2026-10-27 — typecheck/test status: pass

### 2026-10-28 — dependency freshness
```
Package                        Current   Wanted   Latest  Location                                    Depended by
@anthropic-ai/sdk               0.30.1   0.30.1    1.3.0  node_modules/@anthropic-ai/sdk              Relay
@clerk/nextjs                   6.39.6   6.39.8   7.9.22  node_modules/@clerk/nextjs                  Relay
@hookform/resolvers             3.10.0   3.10.0    6.0.2  node_modules/@hookform/resolvers            Relay
@playwright/test                1.61.1   1.64.1   1.64.1  node_modules/@playwright/test               Relay
@prisma/client                  6.19.3   6.19.3   7.10.1  node_modules/@prisma/client                 Relay
@radix-ui/react-dialog          1.1.20    1.3.1    1.3.1  node_modules/@radix-ui/react-dialog         Relay
@radix-ui/react-dropdown-menu   2.1.21    2.2.1    2.2.1  node_modules/@radix-ui/react-dropdown-menu  Relay
@radix-ui/react-popover         1.1.20    1.3.1    1.3.1  node_modules/@radix-ui/react-popover        Relay
@radix-ui/react-select           2.3.4    2.4.1    2.4.1  node_modules/@radix-ui/react-select         Relay
@radix-ui/react-tabs            1.1.18    1.2.1    1.2.1  node_modules/@radix-ui/react-tabs           Relay
@radix-ui/react-toast           1.2.20    1.3.1    1.3.1  node_modules/@radix-ui/react-toast          Relay
@react-pdf/renderer              4.5.1    4.9.0    4.9.0  node_modules/@react-pdf/renderer            Relay
@tanstack/react-query          5.101.4  5.105.0  5.105.0  node_modules/@tanstack/react-query          Relay
@tanstack/react-table           8.21.3   8.21.3    9.3.1  node_modules/@tanstack/react-table          Relay
@trpc/client                   11.18.0  11.19.0  11.19.0  node_modules/@trpc/client                   Relay
@trpc/react-query              11.18.0  11.19.0  11.19.0  node_modules/@trpc/react-query              Relay
@trpc/server                   11.18.0  11.19.0  11.19.0  node_modules/@trpc/server                   Relay
@types/node                    22.20.1  22.20.5   26.6.6  node_modules/@types/node                    Relay
@types/react                   19.2.17   19.3.0   19.3.0  node_modules/@types/react                   Relay
@upstash/ratelimit               2.0.8    2.2.0    2.2.0  node_modules/@upstash/ratelimit             Relay
@upstash/redis                  1.38.0   1.40.0   1.40.0  node_modules/@upstash/redis                 Relay
autoprefixer                    10.5.4   10.6.2   10.6.2  node_modules/autoprefixer                   Relay
eslint                          9.39.5   9.39.5  10.13.0  node_modules/eslint                         Relay
eslint-config-next             15.5.21  15.5.28   16.4.3  node_modules/eslint-config-next             Relay
framer-motion                  11.18.2  11.18.2   14.7.1  node_modules/framer-motion                  Relay
lucide-react                   0.468.0  0.468.0   1.63.0  node_modules/lucide-react                   Relay
next                           15.5.21  15.5.28   16.4.3  node_modules/next                           Relay
openai                         4.104.0  4.104.0   6.49.0  node_modules/openai                         Relay
postcss                         8.5.22   8.5.32   8.5.32  node_modules/postcss                        Relay
prisma                          6.19.3   6.19.3   7.10.1  node_modules/prisma                         Relay
react                           19.2.8   19.3.1   19.3.1  node_modules/react                          Relay
react-dom                       19.2.8   19.3.1   19.3.1  node_modules/react-dom                      Relay
react-hook-form                 7.82.0   7.91.0   7.91.0  node_modules/react-hook-form                Relay
recharts                        2.15.4   2.15.4   3.10.1  node_modules/recharts                       Relay
resend                           4.8.0    4.8.0   6.35.0  node_modules/resend                         Relay
stripe                          17.7.0   17.7.0   23.0.1  node_modules/stripe                         Relay
svix                            1.98.0   1.99.1   1.99.1  node_modules/svix                           Relay
tailwind-merge                   2.6.1    2.6.1    3.7.0  node_modules/tailwind-merge                 Relay
tailwindcss                     3.4.19   3.4.19    4.3.3  node_modules/tailwindcss                    Relay
tsx                             4.23.1  4.23.15  4.23.15  node_modules/tsx                            Relay
typescript                       5.9.3    5.9.3    7.0.2  node_modules/typescript                     Relay
vitest                           2.1.9    2.1.9   4.1.12  node_modules/vitest                         Relay
zod                            3.25.76  3.25.76    4.6.7  node_modules/zod                            Relay
```

### 2026-10-28 — typecheck/test status: pass

### 2026-10-30 — dependency freshness
```
Package                        Current   Wanted   Latest  Location                                    Depended by
@anthropic-ai/sdk               0.30.1   0.30.1    1.3.0  node_modules/@anthropic-ai/sdk              Relay
@clerk/nextjs                   6.39.6   6.39.8   7.9.22  node_modules/@clerk/nextjs                  Relay
@hookform/resolvers             3.10.0   3.10.0    6.0.2  node_modules/@hookform/resolvers            Relay
@playwright/test                1.61.1   1.64.1   1.64.1  node_modules/@playwright/test               Relay
@prisma/client                  6.19.3   6.19.3   7.10.1  node_modules/@prisma/client                 Relay
@radix-ui/react-dialog          1.1.20    1.3.1    1.3.1  node_modules/@radix-ui/react-dialog         Relay
@radix-ui/react-dropdown-menu   2.1.21    2.2.1    2.2.1  node_modules/@radix-ui/react-dropdown-menu  Relay
@radix-ui/react-popover         1.1.20    1.3.1    1.3.1  node_modules/@radix-ui/react-popover        Relay
@radix-ui/react-select           2.3.4    2.4.1    2.4.1  node_modules/@radix-ui/react-select         Relay
@radix-ui/react-tabs            1.1.18    1.2.1    1.2.1  node_modules/@radix-ui/react-tabs           Relay
@radix-ui/react-toast           1.2.20    1.3.1    1.3.1  node_modules/@radix-ui/react-toast          Relay
@react-pdf/renderer              4.5.1    4.9.0    4.9.0  node_modules/@react-pdf/renderer            Relay
@tanstack/react-query          5.101.4  5.105.0  5.105.0  node_modules/@tanstack/react-query          Relay
@tanstack/react-table           8.21.3   8.21.3    9.3.1  node_modules/@tanstack/react-table          Relay
@trpc/client                   11.18.0  11.22.1  11.22.1  node_modules/@trpc/client                   Relay
@trpc/react-query              11.18.0  11.22.1  11.22.1  node_modules/@trpc/react-query              Relay
@trpc/server                   11.18.0  11.22.1  11.22.1  node_modules/@trpc/server                   Relay
@types/node                    22.20.1  22.20.5   26.6.6  node_modules/@types/node                    Relay
@types/react                   19.2.17   19.3.0   19.3.0  node_modules/@types/react                   Relay
@upstash/ratelimit               2.0.8    2.2.0    2.2.0  node_modules/@upstash/ratelimit             Relay
@upstash/redis                  1.38.0   1.40.0   1.40.0  node_modules/@upstash/redis                 Relay
autoprefixer                    10.5.4   10.6.2   10.6.2  node_modules/autoprefixer                   Relay
eslint                          9.39.5   9.39.5  10.14.0  node_modules/eslint                         Relay
eslint-config-next             15.5.21  15.5.28   16.4.3  node_modules/eslint-config-next             Relay
framer-motion                  11.18.2  11.18.2   14.9.0  node_modules/framer-motion                  Relay
lucide-react                   0.468.0  0.468.0   1.65.0  node_modules/lucide-react                   Relay
next                           15.5.21  15.5.28   16.4.3  node_modules/next                           Relay
openai                         4.104.0  4.104.0   6.49.0  node_modules/openai                         Relay
postcss                         8.5.22   8.5.32   8.5.32  node_modules/postcss                        Relay
prisma                          6.19.3   6.19.3   7.10.1  node_modules/prisma                         Relay
react                           19.2.8   19.3.1   19.3.1  node_modules/react                          Relay
react-dom                       19.2.8   19.3.1   19.3.1  node_modules/react-dom                      Relay
react-hook-form                 7.82.0   7.91.0   7.91.0  node_modules/react-hook-form                Relay
recharts                        2.15.4   2.15.4   3.10.1  node_modules/recharts                       Relay
resend                           4.8.0    4.8.0   6.36.0  node_modules/resend                         Relay
stripe                          17.7.0   17.7.0   23.1.0  node_modules/stripe                         Relay
svix                            1.98.0   1.99.1   1.99.1  node_modules/svix                           Relay
tailwind-merge                   2.6.1    2.6.1    3.7.0  node_modules/tailwind-merge                 Relay
tailwindcss                     3.4.19   3.4.19    4.3.3  node_modules/tailwindcss                    Relay
tsx                             4.23.1  4.23.15  4.23.15  node_modules/tsx                            Relay
typescript                       5.9.3    5.9.3    7.0.2  node_modules/typescript                     Relay
vitest                           2.1.9    2.1.9   4.1.12  node_modules/vitest                         Relay
zod                            3.25.76  3.25.76    4.6.7  node_modules/zod                            Relay
```

### 2026-10-30 — typecheck/test status: pass

### 2026-11-02 — dependency freshness
```
Package                        Current   Wanted   Latest  Location                                    Depended by
@anthropic-ai/sdk               0.30.1   0.30.1    1.4.0  node_modules/@anthropic-ai/sdk              Relay
@clerk/nextjs                   6.39.6   6.39.8   7.9.23  node_modules/@clerk/nextjs                  Relay
@hookform/resolvers             3.10.0   3.10.0    7.0.1  node_modules/@hookform/resolvers            Relay
@playwright/test                1.61.1   1.64.1   1.64.1  node_modules/@playwright/test               Relay
@prisma/client                  6.19.3   6.19.3   7.10.1  node_modules/@prisma/client                 Relay
@radix-ui/react-dialog          1.1.20    1.3.1    1.3.1  node_modules/@radix-ui/react-dialog         Relay
@radix-ui/react-dropdown-menu   2.1.21    2.2.1    2.2.1  node_modules/@radix-ui/react-dropdown-menu  Relay
@radix-ui/react-popover         1.1.20    1.3.1    1.3.1  node_modules/@radix-ui/react-popover        Relay
@radix-ui/react-select           2.3.4    2.4.1    2.4.1  node_modules/@radix-ui/react-select         Relay
@radix-ui/react-tabs            1.1.18    1.2.1    1.2.1  node_modules/@radix-ui/react-tabs           Relay
@radix-ui/react-toast           1.2.20    1.3.1    1.3.1  node_modules/@radix-ui/react-toast          Relay
@react-pdf/renderer              4.5.1    4.9.0    4.9.0  node_modules/@react-pdf/renderer            Relay
@tanstack/react-query          5.101.4  5.105.3  5.105.3  node_modules/@tanstack/react-query          Relay
@tanstack/react-table           8.21.3   8.21.3    9.3.1  node_modules/@tanstack/react-table          Relay
@trpc/client                   11.18.0  11.23.0  11.23.0  node_modules/@trpc/client                   Relay
@trpc/react-query              11.18.0  11.23.0  11.23.0  node_modules/@trpc/react-query              Relay
@trpc/server                   11.18.0  11.23.0  11.23.0  node_modules/@trpc/server                   Relay
@types/node                    22.20.1  22.20.5   26.6.6  node_modules/@types/node                    Relay
@types/react                   19.2.17   19.3.0   19.3.0  node_modules/@types/react                   Relay
@upstash/ratelimit               2.0.8    2.2.0    2.2.0  node_modules/@upstash/ratelimit             Relay
@upstash/redis                  1.38.0   1.41.0   1.41.0  node_modules/@upstash/redis                 Relay
autoprefixer                    10.5.4   10.6.2   10.6.2  node_modules/autoprefixer                   Relay
eslint                          9.39.5   9.39.5  10.14.0  node_modules/eslint                         Relay
eslint-config-next             15.5.21  15.5.28   16.4.4  node_modules/eslint-config-next             Relay
framer-motion                  11.18.2  11.18.2   14.9.0  node_modules/framer-motion                  Relay
lucide-react                   0.468.0  0.468.0   1.66.0  node_modules/lucide-react                   Relay
next                           15.5.21  15.5.28   16.4.4  node_modules/next                           Relay
openai                         4.104.0  4.104.0   6.49.0  node_modules/openai                         Relay
postcss                         8.5.22   8.5.32   8.5.32  node_modules/postcss                        Relay
prisma                          6.19.3   6.19.3   7.10.1  node_modules/prisma                         Relay
react                           19.2.8   19.3.1   19.3.1  node_modules/react                          Relay
react-dom                       19.2.8   19.3.1   19.3.1  node_modules/react-dom                      Relay
react-hook-form                 7.82.0   7.91.0   7.91.0  node_modules/react-hook-form                Relay
recharts                        2.15.4   2.15.4   3.10.1  node_modules/recharts                       Relay
resend                           4.8.0    4.8.0   6.37.0  node_modules/resend                         Relay
stripe                          17.7.0   17.7.0   23.1.0  node_modules/stripe                         Relay
svix                            1.98.0   1.99.1   1.99.1  node_modules/svix                           Relay
tailwind-merge                   2.6.1    2.6.1    3.7.0  node_modules/tailwind-merge                 Relay
tailwindcss                     3.4.19   3.4.19    4.3.4  node_modules/tailwindcss                    Relay
tsx                             4.23.1  4.23.15  4.23.15  node_modules/tsx                            Relay
typescript                       5.9.3    5.9.3    7.0.2  node_modules/typescript                     Relay
vitest                           2.1.9    2.1.9   4.1.12  node_modules/vitest                         Relay
zod                            3.25.76  3.25.76    4.6.7  node_modules/zod                            Relay
```

### 2026-11-02 — typecheck/test status: pass

### 2026-11-03 — dependency freshness
```
Package                        Current   Wanted   Latest  Location                                    Depended by
@anthropic-ai/sdk               0.30.1   0.30.1    1.4.0  node_modules/@anthropic-ai/sdk              Relay
@clerk/nextjs                   6.39.6   6.39.8   7.9.24  node_modules/@clerk/nextjs                  Relay
@hookform/resolvers             3.10.0   3.10.0    7.0.2  node_modules/@hookform/resolvers            Relay
@playwright/test                1.61.1   1.64.1   1.64.1  node_modules/@playwright/test               Relay
@prisma/client                  6.19.3   6.19.3   7.10.1  node_modules/@prisma/client                 Relay
@radix-ui/react-dialog          1.1.20    1.3.1    1.3.1  node_modules/@radix-ui/react-dialog         Relay
@radix-ui/react-dropdown-menu   2.1.21    2.2.1    2.2.1  node_modules/@radix-ui/react-dropdown-menu  Relay
@radix-ui/react-popover         1.1.20    1.3.1    1.3.1  node_modules/@radix-ui/react-popover        Relay
@radix-ui/react-select           2.3.4    2.4.1    2.4.1  node_modules/@radix-ui/react-select         Relay
@radix-ui/react-tabs            1.1.18    1.2.1    1.2.1  node_modules/@radix-ui/react-tabs           Relay
@radix-ui/react-toast           1.2.20    1.3.1    1.3.1  node_modules/@radix-ui/react-toast          Relay
@react-pdf/renderer              4.5.1    4.9.0    4.9.0  node_modules/@react-pdf/renderer            Relay
@tanstack/react-query          5.101.4  5.105.3  5.105.3  node_modules/@tanstack/react-query          Relay
@tanstack/react-table           8.21.3   8.21.3    9.3.1  node_modules/@tanstack/react-table          Relay
@trpc/client                   11.18.0  11.23.0  11.23.0  node_modules/@trpc/client                   Relay
@trpc/react-query              11.18.0  11.23.0  11.23.0  node_modules/@trpc/react-query              Relay
@trpc/server                   11.18.0  11.23.0  11.23.0  node_modules/@trpc/server                   Relay
@types/node                    22.20.1  22.20.5   26.6.6  node_modules/@types/node                    Relay
@types/react                   19.2.17   19.3.0   19.3.0  node_modules/@types/react                   Relay
@upstash/ratelimit               2.0.8    2.2.0    2.2.0  node_modules/@upstash/ratelimit             Relay
@upstash/redis                  1.38.0   1.41.0   1.41.0  node_modules/@upstash/redis                 Relay
autoprefixer                    10.5.4   10.6.2   10.6.2  node_modules/autoprefixer                   Relay
eslint                          9.39.5   9.39.5  10.14.0  node_modules/eslint                         Relay
eslint-config-next             15.5.21  15.5.29   16.4.5  node_modules/eslint-config-next             Relay
framer-motion                  11.18.2  11.18.2   14.9.0  node_modules/framer-motion                  Relay
lucide-react                   0.468.0  0.468.0   1.67.0  node_modules/lucide-react                   Relay
next                           15.5.21  15.5.29   16.4.5  node_modules/next                           Relay
openai                         4.104.0  4.104.0   6.49.0  node_modules/openai                         Relay
postcss                         8.5.22   8.5.32   8.5.32  node_modules/postcss                        Relay
prisma                          6.19.3   6.19.3   7.10.1  node_modules/prisma                         Relay
react                           19.2.8   19.3.1   19.3.1  node_modules/react                          Relay
react-dom                       19.2.8   19.3.1   19.3.1  node_modules/react-dom                      Relay
react-hook-form                 7.82.0   7.91.0   7.91.0  node_modules/react-hook-form                Relay
recharts                        2.15.4   2.15.4   3.10.1  node_modules/recharts                       Relay
resend                           4.8.0    4.8.0   6.37.0  node_modules/resend                         Relay
stripe                          17.7.0   17.7.0   23.1.0  node_modules/stripe                         Relay
svix                            1.98.0   1.99.1   1.99.1  node_modules/svix                           Relay
tailwind-merge                   2.6.1    2.6.1    3.7.0  node_modules/tailwind-merge                 Relay
tailwindcss                     3.4.19   3.4.19    4.3.4  node_modules/tailwindcss                    Relay
tsx                             4.23.1  4.23.15  4.23.15  node_modules/tsx                            Relay
typescript                       5.9.3    5.9.3    7.0.2  node_modules/typescript                     Relay
vitest                           2.1.9    2.1.9   4.1.12  node_modules/vitest                         Relay
zod                            3.25.76  3.25.76    4.6.7  node_modules/zod                            Relay
```

### 2026-11-03 — typecheck/test status: pass

### 2026-11-04 — dependency freshness
```
Package                        Current   Wanted   Latest  Location                                    Depended by
@anthropic-ai/sdk               0.30.1   0.30.1    1.5.0  node_modules/@anthropic-ai/sdk              Relay
@clerk/nextjs                   6.39.6   6.39.8   7.9.24  node_modules/@clerk/nextjs                  Relay
@hookform/resolvers             3.10.0   3.10.0    7.0.2  node_modules/@hookform/resolvers            Relay
@playwright/test                1.61.1   1.64.1   1.64.1  node_modules/@playwright/test               Relay
@prisma/client                  6.19.3   6.19.3   7.10.1  node_modules/@prisma/client                 Relay
@radix-ui/react-dialog          1.1.20    1.3.1    1.3.1  node_modules/@radix-ui/react-dialog         Relay
@radix-ui/react-dropdown-menu   2.1.21    2.2.1    2.2.1  node_modules/@radix-ui/react-dropdown-menu  Relay
@radix-ui/react-popover         1.1.20    1.3.1    1.3.1  node_modules/@radix-ui/react-popover        Relay
@radix-ui/react-select           2.3.4    2.4.1    2.4.1  node_modules/@radix-ui/react-select         Relay
@radix-ui/react-tabs            1.1.18    1.2.1    1.2.1  node_modules/@radix-ui/react-tabs           Relay
@radix-ui/react-toast           1.2.20    1.3.1    1.3.1  node_modules/@radix-ui/react-toast          Relay
@react-pdf/renderer              4.5.1    4.9.0    4.9.0  node_modules/@react-pdf/renderer            Relay
@tanstack/react-query          5.101.4  5.106.0  5.106.0  node_modules/@tanstack/react-query          Relay
@tanstack/react-table           8.21.3   8.21.3    9.3.1  node_modules/@tanstack/react-table          Relay
@trpc/client                   11.18.0  11.24.0  11.24.0  node_modules/@trpc/client                   Relay
@trpc/react-query              11.18.0  11.24.0  11.24.0  node_modules/@trpc/react-query              Relay
@trpc/server                   11.18.0  11.24.0  11.24.0  node_modules/@trpc/server                   Relay
@types/node                    22.20.1  22.20.5   26.6.6  node_modules/@types/node                    Relay
@types/react                   19.2.17   19.3.0   19.3.0  node_modules/@types/react                   Relay
@upstash/ratelimit               2.0.8    2.2.0    2.2.0  node_modules/@upstash/ratelimit             Relay
@upstash/redis                  1.38.0   1.41.0   1.41.0  node_modules/@upstash/redis                 Relay
autoprefixer                    10.5.4   10.6.2   10.6.2  node_modules/autoprefixer                   Relay
eslint                          9.39.5   9.39.5  10.14.0  node_modules/eslint                         Relay
eslint-config-next             15.5.21  15.5.29   16.4.5  node_modules/eslint-config-next             Relay
framer-motion                  11.18.2  11.18.2   14.9.1  node_modules/framer-motion                  Relay
lucide-react                   0.468.0  0.468.0   1.68.0  node_modules/lucide-react                   Relay
next                           15.5.21  15.5.29   16.4.5  node_modules/next                           Relay
openai                         4.104.0  4.104.0   6.49.0  node_modules/openai                         Relay
postcss                         8.5.22   8.5.32   8.5.32  node_modules/postcss                        Relay
prisma                          6.19.3   6.19.3   7.10.1  node_modules/prisma                         Relay
react                           19.2.8   19.3.1   19.3.1  node_modules/react                          Relay
react-dom                       19.2.8   19.3.1   19.3.1  node_modules/react-dom                      Relay
react-hook-form                 7.82.0   7.91.0   7.91.0  node_modules/react-hook-form                Relay
recharts                        2.15.4   2.15.4   3.10.1  node_modules/recharts                       Relay
resend                           4.8.0    4.8.0   6.37.0  node_modules/resend                         Relay
stripe                          17.7.0   17.7.0   23.1.0  node_modules/stripe                         Relay
svix                            1.98.0   1.99.1   1.99.1  node_modules/svix                           Relay
tailwind-merge                   2.6.1    2.6.1    3.7.0  node_modules/tailwind-merge                 Relay
tailwindcss                     3.4.19   3.4.19    4.3.4  node_modules/tailwindcss                    Relay
tsx                             4.23.1  4.23.15  4.23.15  node_modules/tsx                            Relay
typescript                       5.9.3    5.9.3    7.0.2  node_modules/typescript                     Relay
vitest                           2.1.9    2.1.9   4.1.12  node_modules/vitest                         Relay
zod                            3.25.76  3.25.76    4.6.7  node_modules/zod                            Relay
```

### 2026-11-04 — typecheck/test status: pass

### 2026-11-06 — dependency freshness
```
Package                        Current   Wanted   Latest  Location                                    Depended by
@anthropic-ai/sdk               0.30.1   0.30.1    1.6.0  node_modules/@anthropic-ai/sdk              Relay
@clerk/nextjs                   6.39.6   6.39.8   7.9.25  node_modules/@clerk/nextjs                  Relay
@hookform/resolvers             3.10.0   3.10.0    7.0.3  node_modules/@hookform/resolvers            Relay
@playwright/test                1.61.1   1.65.0   1.65.0  node_modules/@playwright/test               Relay
@prisma/client                  6.19.3   6.19.3   7.10.1  node_modules/@prisma/client                 Relay
@radix-ui/react-dialog          1.1.20    1.3.1    1.3.1  node_modules/@radix-ui/react-dialog         Relay
@radix-ui/react-dropdown-menu   2.1.21    2.2.1    2.2.1  node_modules/@radix-ui/react-dropdown-menu  Relay
@radix-ui/react-popover         1.1.20    1.3.1    1.3.1  node_modules/@radix-ui/react-popover        Relay
@radix-ui/react-select           2.3.4    2.4.1    2.4.1  node_modules/@radix-ui/react-select         Relay
@radix-ui/react-tabs            1.1.18    1.2.1    1.2.1  node_modules/@radix-ui/react-tabs           Relay
@radix-ui/react-toast           1.2.20    1.3.1    1.3.1  node_modules/@radix-ui/react-toast          Relay
@react-pdf/renderer              4.5.1    4.9.0    4.9.0  node_modules/@react-pdf/renderer            Relay
@tanstack/react-query          5.101.4  5.106.1  5.106.1  node_modules/@tanstack/react-query          Relay
@tanstack/react-table           8.21.3   8.21.3    9.3.1  node_modules/@tanstack/react-table          Relay
@trpc/client                   11.18.0  11.25.0  11.25.0  node_modules/@trpc/client                   Relay
@trpc/react-query              11.18.0  11.25.0  11.25.0  node_modules/@trpc/react-query              Relay
@trpc/server                   11.18.0  11.25.0  11.25.0  node_modules/@trpc/server                   Relay
@types/node                    22.20.1  22.20.5   26.6.6  node_modules/@types/node                    Relay
@types/react                   19.2.17   19.3.0   19.3.0  node_modules/@types/react                   Relay
@upstash/ratelimit               2.0.8    2.2.0    2.2.0  node_modules/@upstash/ratelimit             Relay
@upstash/redis                  1.38.0   1.41.0   1.41.0  node_modules/@upstash/redis                 Relay
autoprefixer                    10.5.4   10.6.2   10.6.2  node_modules/autoprefixer                   Relay
eslint                          9.39.5   9.39.5  10.14.0  node_modules/eslint                         Relay
eslint-config-next             15.5.21  15.5.29   16.4.5  node_modules/eslint-config-next             Relay
framer-motion                  11.18.2  11.18.2  14.10.1  node_modules/framer-motion                  Relay
lucide-react                   0.468.0  0.468.0   1.70.0  node_modules/lucide-react                   Relay
next                           15.5.21  15.5.29   16.4.5  node_modules/next                           Relay
openai                         4.104.0  4.104.0   6.49.0  node_modules/openai                         Relay
postcss                         8.5.22   8.5.32   8.5.32  node_modules/postcss                        Relay
prisma                          6.19.3   6.19.3   7.10.1  node_modules/prisma                         Relay
react                           19.2.8   19.3.1   19.3.1  node_modules/react                          Relay
react-dom                       19.2.8   19.3.1   19.3.1  node_modules/react-dom                      Relay
react-hook-form                 7.82.0   7.91.0   7.91.0  node_modules/react-hook-form                Relay
recharts                        2.15.4   2.15.4   3.10.1  node_modules/recharts                       Relay
resend                           4.8.0    4.8.0   6.37.0  node_modules/resend                         Relay
stripe                          17.7.0   17.7.0   23.1.0  node_modules/stripe                         Relay
svix                            1.98.0   1.99.1   1.99.1  node_modules/svix                           Relay
tailwind-merge                   2.6.1    2.6.1    3.7.0  node_modules/tailwind-merge                 Relay
tailwindcss                     3.4.19   3.4.19    4.3.5  node_modules/tailwindcss                    Relay
tsx                             4.23.1  4.23.15  4.23.15  node_modules/tsx                            Relay
typescript                       5.9.3    5.9.3    7.0.2  node_modules/typescript                     Relay
vitest                           2.1.9    2.1.9   4.1.12  node_modules/vitest                         Relay
zod                            3.25.76  3.25.76    4.6.7  node_modules/zod                            Relay
```

### 2026-11-06 — typecheck/test status: pass

### 2026-11-09 — dependency freshness
```
Package                        Current   Wanted   Latest  Location                                    Depended by
@anthropic-ai/sdk               0.30.1   0.30.1    1.7.0  node_modules/@anthropic-ai/sdk              Relay
@clerk/nextjs                   6.39.6   6.39.8   7.9.25  node_modules/@clerk/nextjs                  Relay
@hookform/resolvers             3.10.0   3.10.0    7.0.5  node_modules/@hookform/resolvers            Relay
@playwright/test                1.61.1   1.65.0   1.65.0  node_modules/@playwright/test               Relay
@prisma/client                  6.19.3   6.19.3   7.10.1  node_modules/@prisma/client                 Relay
@radix-ui/react-dialog          1.1.20    1.3.1    1.3.1  node_modules/@radix-ui/react-dialog         Relay
@radix-ui/react-dropdown-menu   2.1.21    2.2.1    2.2.1  node_modules/@radix-ui/react-dropdown-menu  Relay
@radix-ui/react-popover         1.1.20    1.3.1    1.3.1  node_modules/@radix-ui/react-popover        Relay
@radix-ui/react-select           2.3.4    2.4.1    2.4.1  node_modules/@radix-ui/react-select         Relay
@radix-ui/react-tabs            1.1.18    1.2.1    1.2.1  node_modules/@radix-ui/react-tabs           Relay
@radix-ui/react-toast           1.2.20    1.3.1    1.3.1  node_modules/@radix-ui/react-toast          Relay
@react-pdf/renderer              4.5.1    4.9.0    4.9.0  node_modules/@react-pdf/renderer            Relay
@tanstack/react-query          5.101.4  5.107.1  5.107.1  node_modules/@tanstack/react-query          Relay
@tanstack/react-table           8.21.3   8.21.3    9.3.1  node_modules/@tanstack/react-table          Relay
@trpc/client                   11.18.0  11.26.0  11.26.0  node_modules/@trpc/client                   Relay
@trpc/react-query              11.18.0  11.26.0  11.26.0  node_modules/@trpc/react-query              Relay
@trpc/server                   11.18.0  11.26.0  11.26.0  node_modules/@trpc/server                   Relay
@types/node                    22.20.1  22.20.5   26.6.6  node_modules/@types/node                    Relay
@types/react                   19.2.17   19.3.0   19.3.0  node_modules/@types/react                   Relay
@upstash/ratelimit               2.0.8    2.2.0    2.2.0  node_modules/@upstash/ratelimit             Relay
@upstash/redis                  1.38.0   1.41.0   1.41.0  node_modules/@upstash/redis                 Relay
autoprefixer                    10.5.4   10.6.2   10.6.2  node_modules/autoprefixer                   Relay
eslint                          9.39.5   9.39.5  10.14.0  node_modules/eslint                         Relay
eslint-config-next             15.5.21  15.5.29   16.4.6  node_modules/eslint-config-next             Relay
framer-motion                  11.18.2  11.18.2  14.11.1  node_modules/framer-motion                  Relay
lucide-react                   0.468.0  0.468.0   1.70.0  node_modules/lucide-react                   Relay
next                           15.5.21  15.5.29   16.4.6  node_modules/next                           Relay
openai                         4.104.0  4.104.0   6.49.0  node_modules/openai                         Relay
postcss                         8.5.22   8.5.32   8.5.32  node_modules/postcss                        Relay
prisma                          6.19.3   6.19.3   7.10.1  node_modules/prisma                         Relay
react                           19.2.8   19.3.1   19.3.1  node_modules/react                          Relay
react-dom                       19.2.8   19.3.1   19.3.1  node_modules/react-dom                      Relay
react-hook-form                 7.82.0   7.91.0   7.91.0  node_modules/react-hook-form                Relay
recharts                        2.15.4   2.15.4   3.10.1  node_modules/recharts                       Relay
resend                           4.8.0    4.8.0   6.37.0  node_modules/resend                         Relay
stripe                          17.7.0   17.7.0   23.1.0  node_modules/stripe                         Relay
svix                            1.98.0   1.99.1   1.99.1  node_modules/svix                           Relay
tailwind-merge                   2.6.1    2.6.1    3.7.0  node_modules/tailwind-merge                 Relay
tailwindcss                     3.4.19   3.4.19    4.3.5  node_modules/tailwindcss                    Relay
tsx                             4.23.1  4.23.15  4.23.15  node_modules/tsx                            Relay
typescript                       5.9.3    5.9.3    7.0.2  node_modules/typescript                     Relay
vitest                           2.1.9    2.1.9   4.1.12  node_modules/vitest                         Relay
zod                            3.25.76  3.25.76    4.6.7  node_modules/zod                            Relay
```

### 2026-11-09 — typecheck/test status: pass

### 2026-11-10 — dependency freshness
```
Package                        Current   Wanted   Latest  Location                                    Depended by
@anthropic-ai/sdk               0.30.1   0.30.1    1.8.0  node_modules/@anthropic-ai/sdk              Relay
@clerk/nextjs                   6.39.6   6.39.8   7.9.25  node_modules/@clerk/nextjs                  Relay
@hookform/resolvers             3.10.0   3.10.0    7.0.5  node_modules/@hookform/resolvers            Relay
@playwright/test                1.61.1   1.65.0   1.65.0  node_modules/@playwright/test               Relay
@prisma/client                  6.19.3   6.19.3   7.10.1  node_modules/@prisma/client                 Relay
@radix-ui/react-dialog          1.1.20    1.3.1    1.3.1  node_modules/@radix-ui/react-dialog         Relay
@radix-ui/react-dropdown-menu   2.1.21    2.2.1    2.2.1  node_modules/@radix-ui/react-dropdown-menu  Relay
@radix-ui/react-popover         1.1.20    1.3.1    1.3.1  node_modules/@radix-ui/react-popover        Relay
@radix-ui/react-select           2.3.4    2.4.1    2.4.1  node_modules/@radix-ui/react-select         Relay
@radix-ui/react-tabs            1.1.18    1.2.1    1.2.1  node_modules/@radix-ui/react-tabs           Relay
@radix-ui/react-toast           1.2.20    1.3.1    1.3.1  node_modules/@radix-ui/react-toast          Relay
@react-pdf/renderer              4.5.1    4.9.0    4.9.0  node_modules/@react-pdf/renderer            Relay
@tanstack/react-query          5.101.4  5.107.1  5.107.1  node_modules/@tanstack/react-query          Relay
@tanstack/react-table           8.21.3   8.21.3    9.3.1  node_modules/@tanstack/react-table          Relay
@trpc/client                   11.18.0  11.28.0  11.28.0  node_modules/@trpc/client                   Relay
@trpc/react-query              11.18.0  11.28.0  11.28.0  node_modules/@trpc/react-query              Relay
@trpc/server                   11.18.0  11.28.0  11.28.0  node_modules/@trpc/server                   Relay
@types/node                    22.20.1  22.20.5   26.6.6  node_modules/@types/node                    Relay
@types/react                   19.2.17   19.3.0   19.3.0  node_modules/@types/react                   Relay
@upstash/ratelimit               2.0.8    2.2.0    2.2.0  node_modules/@upstash/ratelimit             Relay
@upstash/redis                  1.38.0   1.41.0   1.41.0  node_modules/@upstash/redis                 Relay
autoprefixer                    10.5.4   10.6.2   10.6.2  node_modules/autoprefixer                   Relay
eslint                          9.39.5   9.39.5  10.14.0  node_modules/eslint                         Relay
eslint-config-next             15.5.21  15.5.29   16.4.6  node_modules/eslint-config-next             Relay
framer-motion                  11.18.2  11.18.2  14.12.0  node_modules/framer-motion                  Relay
lucide-react                   0.468.0  0.468.0   1.71.0  node_modules/lucide-react                   Relay
next                           15.5.21  15.5.29   16.4.6  node_modules/next                           Relay
openai                         4.104.0  4.104.0   6.49.0  node_modules/openai                         Relay
postcss                         8.5.22   8.5.32   8.5.32  node_modules/postcss                        Relay
prisma                          6.19.3   6.19.3   7.10.1  node_modules/prisma                         Relay
react                           19.2.8   19.3.1   19.3.1  node_modules/react                          Relay
react-dom                       19.2.8   19.3.1   19.3.1  node_modules/react-dom                      Relay
react-hook-form                 7.82.0   7.91.0   7.91.0  node_modules/react-hook-form                Relay
recharts                        2.15.4   2.15.4   3.10.1  node_modules/recharts                       Relay
resend                           4.8.0    4.8.0   6.38.0  node_modules/resend                         Relay
stripe                          17.7.0   17.7.0   23.1.0  node_modules/stripe                         Relay
svix                            1.98.0   1.99.1   1.99.1  node_modules/svix                           Relay
tailwind-merge                   2.6.1    2.6.1    3.7.0  node_modules/tailwind-merge                 Relay
tailwindcss                     3.4.19   3.4.19    4.3.5  node_modules/tailwindcss                    Relay
tsx                             4.23.1  4.23.15  4.23.15  node_modules/tsx                            Relay
typescript                       5.9.3    5.9.3    7.0.2  node_modules/typescript                     Relay
vitest                           2.1.9    2.1.9   4.1.12  node_modules/vitest                         Relay
zod                            3.25.76  3.25.76    4.6.7  node_modules/zod                            Relay
```

### 2026-11-10 — typecheck/test status: pass

### 2026-11-11 — dependency freshness
```
Package                        Current   Wanted   Latest  Location                                    Depended by
@anthropic-ai/sdk               0.30.1   0.30.1    1.8.0  node_modules/@anthropic-ai/sdk              Relay
@clerk/nextjs                   6.39.6   6.39.9   7.9.25  node_modules/@clerk/nextjs                  Relay
@hookform/resolvers             3.10.0   3.10.0    7.0.5  node_modules/@hookform/resolvers            Relay
@playwright/test                1.61.1   1.65.0   1.65.0  node_modules/@playwright/test               Relay
@prisma/client                  6.19.3   6.19.3   7.10.1  node_modules/@prisma/client                 Relay
@radix-ui/react-dialog          1.1.20    1.3.1    1.3.1  node_modules/@radix-ui/react-dialog         Relay
@radix-ui/react-dropdown-menu   2.1.21    2.2.1    2.2.1  node_modules/@radix-ui/react-dropdown-menu  Relay
@radix-ui/react-popover         1.1.20    1.3.1    1.3.1  node_modules/@radix-ui/react-popover        Relay
@radix-ui/react-select           2.3.4    2.4.1    2.4.1  node_modules/@radix-ui/react-select         Relay
@radix-ui/react-tabs            1.1.18    1.2.1    1.2.1  node_modules/@radix-ui/react-tabs           Relay
@radix-ui/react-toast           1.2.20    1.3.1    1.3.1  node_modules/@radix-ui/react-toast          Relay
@react-pdf/renderer              4.5.1    4.9.0    4.9.0  node_modules/@react-pdf/renderer            Relay
@tanstack/react-query          5.101.4  5.107.1  5.107.1  node_modules/@tanstack/react-query          Relay
@tanstack/react-table           8.21.3   8.21.3    9.3.1  node_modules/@tanstack/react-table          Relay
@trpc/client                   11.18.0  11.28.0  11.28.0  node_modules/@trpc/client                   Relay
@trpc/react-query              11.18.0  11.28.0  11.28.0  node_modules/@trpc/react-query              Relay
@trpc/server                   11.18.0  11.28.0  11.28.0  node_modules/@trpc/server                   Relay
@types/node                    22.20.1  22.20.5   26.6.6  node_modules/@types/node                    Relay
@types/react                   19.2.17   19.3.0   19.3.0  node_modules/@types/react                   Relay
@upstash/ratelimit               2.0.8    2.2.0    2.2.0  node_modules/@upstash/ratelimit             Relay
@upstash/redis                  1.38.0   1.41.0   1.41.0  node_modules/@upstash/redis                 Relay
autoprefixer                    10.5.4   10.6.2   10.6.2  node_modules/autoprefixer                   Relay
eslint                          9.39.5   9.39.5  10.14.0  node_modules/eslint                         Relay
eslint-config-next             15.5.21  15.5.29   16.4.6  node_modules/eslint-config-next             Relay
framer-motion                  11.18.2  11.18.2  14.12.0  node_modules/framer-motion                  Relay
lucide-react                   0.468.0  0.468.0   1.72.0  node_modules/lucide-react                   Relay
next                           15.5.21  15.5.29   16.4.6  node_modules/next                           Relay
openai                         4.104.0  4.104.0   6.49.0  node_modules/openai                         Relay
postcss                         8.5.22   8.5.32   8.5.32  node_modules/postcss                        Relay
prisma                          6.19.3   6.19.3   7.10.1  node_modules/prisma                         Relay
react                           19.2.8   19.3.1   19.3.1  node_modules/react                          Relay
react-dom                       19.2.8   19.3.1   19.3.1  node_modules/react-dom                      Relay
react-hook-form                 7.82.0   7.92.0   7.92.0  node_modules/react-hook-form                Relay
recharts                        2.15.4   2.15.4   3.10.1  node_modules/recharts                       Relay
resend                           4.8.0    4.8.0   6.38.0  node_modules/resend                         Relay
stripe                          17.7.0   17.7.0   23.1.0  node_modules/stripe                         Relay
svix                            1.98.0   1.99.1   1.99.1  node_modules/svix                           Relay
tailwind-merge                   2.6.1    2.6.1    3.7.0  node_modules/tailwind-merge                 Relay
tailwindcss                     3.4.19   3.4.19    4.3.5  node_modules/tailwindcss                    Relay
tsx                             4.23.1  4.23.15  4.23.15  node_modules/tsx                            Relay
typescript                       5.9.3    5.9.3    7.0.2  node_modules/typescript                     Relay
vitest                           2.1.9    2.1.9   4.1.12  node_modules/vitest                         Relay
zod                            3.25.76  3.25.76    4.6.7  node_modules/zod                            Relay
```

### 2026-11-11 — typecheck/test status: pass

### 2026-11-12 — dependency freshness
```
Package                        Current   Wanted   Latest  Location                                    Depended by
@anthropic-ai/sdk               0.30.1   0.30.1    1.8.0  node_modules/@anthropic-ai/sdk              Relay
@clerk/nextjs                   6.39.6   6.39.9   7.9.25  node_modules/@clerk/nextjs                  Relay
@hookform/resolvers             3.10.0   3.10.0    7.0.6  node_modules/@hookform/resolvers            Relay
@playwright/test                1.61.1   1.65.0   1.65.0  node_modules/@playwright/test               Relay
@prisma/client                  6.19.3   6.19.3   7.10.1  node_modules/@prisma/client                 Relay
@radix-ui/react-dialog          1.1.20    1.3.1    1.3.1  node_modules/@radix-ui/react-dialog         Relay
@radix-ui/react-dropdown-menu   2.1.21    2.2.1    2.2.1  node_modules/@radix-ui/react-dropdown-menu  Relay
@radix-ui/react-popover         1.1.20    1.3.1    1.3.1  node_modules/@radix-ui/react-popover        Relay
@radix-ui/react-select           2.3.4    2.4.1    2.4.1  node_modules/@radix-ui/react-select         Relay
@radix-ui/react-tabs            1.1.18    1.2.1    1.2.1  node_modules/@radix-ui/react-tabs           Relay
@radix-ui/react-toast           1.2.20    1.3.1    1.3.1  node_modules/@radix-ui/react-toast          Relay
@react-pdf/renderer              4.5.1    4.9.0    4.9.0  node_modules/@react-pdf/renderer            Relay
@tanstack/react-query          5.101.4  5.107.1  5.107.1  node_modules/@tanstack/react-query          Relay
@tanstack/react-table           8.21.3   8.21.3    9.3.1  node_modules/@tanstack/react-table          Relay
@trpc/client                   11.18.0  11.28.0  11.28.0  node_modules/@trpc/client                   Relay
@trpc/react-query              11.18.0  11.28.0  11.28.0  node_modules/@trpc/react-query              Relay
@trpc/server                   11.18.0  11.28.0  11.28.0  node_modules/@trpc/server                   Relay
@types/node                    22.20.1  22.20.5   26.6.6  node_modules/@types/node                    Relay
@types/react                   19.2.17   19.3.0   19.3.0  node_modules/@types/react                   Relay
@upstash/ratelimit               2.0.8    2.2.1    2.2.1  node_modules/@upstash/ratelimit             Relay
@upstash/redis                  1.38.0   1.41.0   1.41.0  node_modules/@upstash/redis                 Relay
autoprefixer                    10.5.4   10.6.2   10.6.2  node_modules/autoprefixer                   Relay
eslint                          9.39.5   9.39.5  10.14.0  node_modules/eslint                         Relay
eslint-config-next             15.5.21  15.5.29   16.4.6  node_modules/eslint-config-next             Relay
framer-motion                  11.18.2  11.18.2  14.13.0  node_modules/framer-motion                  Relay
lucide-react                   0.468.0  0.468.0   1.72.0  node_modules/lucide-react                   Relay
next                           15.5.21  15.5.29   16.4.6  node_modules/next                           Relay
openai                         4.104.0  4.104.0   6.49.0  node_modules/openai                         Relay
postcss                         8.5.22   8.5.32   8.5.32  node_modules/postcss                        Relay
prisma                          6.19.3   6.19.3   7.10.1  node_modules/prisma                         Relay
react                           19.2.8   19.3.1   19.3.1  node_modules/react                          Relay
react-dom                       19.2.8   19.3.1   19.3.1  node_modules/react-dom                      Relay
react-hook-form                 7.82.0   7.92.0   7.92.0  node_modules/react-hook-form                Relay
recharts                        2.15.4   2.15.4   3.10.1  node_modules/recharts                       Relay
resend                           4.8.0    4.8.0   6.38.0  node_modules/resend                         Relay
stripe                          17.7.0   17.7.0   23.1.0  node_modules/stripe                         Relay
svix                            1.98.0   1.99.1   1.99.1  node_modules/svix                           Relay
tailwind-merge                   2.6.1    2.6.1    3.7.0  node_modules/tailwind-merge                 Relay
tailwindcss                     3.4.19   3.4.19    4.3.5  node_modules/tailwindcss                    Relay
tsx                             4.23.1  4.23.15  4.23.15  node_modules/tsx                            Relay
typescript                       5.9.3    5.9.3    7.0.2  node_modules/typescript                     Relay
vitest                           2.1.9    2.1.9   4.1.12  node_modules/vitest                         Relay
zod                            3.25.76  3.25.76    4.6.7  node_modules/zod                            Relay
```

### 2026-11-12 — typecheck/test status: pass

### 2026-11-13 — dependency freshness
```
Package                        Current   Wanted   Latest  Location                                    Depended by
@anthropic-ai/sdk               0.30.1   0.30.1    1.8.0  node_modules/@anthropic-ai/sdk              Relay
@clerk/nextjs                   6.39.6   6.39.9   7.9.26  node_modules/@clerk/nextjs                  Relay
@hookform/resolvers             3.10.0   3.10.0    7.0.6  node_modules/@hookform/resolvers            Relay
@playwright/test                1.61.1   1.65.0   1.65.0  node_modules/@playwright/test               Relay
@prisma/client                  6.19.3   6.19.3   7.10.1  node_modules/@prisma/client                 Relay
@radix-ui/react-dialog          1.1.20    1.3.1    1.3.1  node_modules/@radix-ui/react-dialog         Relay
@radix-ui/react-dropdown-menu   2.1.21    2.2.1    2.2.1  node_modules/@radix-ui/react-dropdown-menu  Relay
@radix-ui/react-popover         1.1.20    1.3.1    1.3.1  node_modules/@radix-ui/react-popover        Relay
@radix-ui/react-select           2.3.4    2.4.1    2.4.1  node_modules/@radix-ui/react-select         Relay
@radix-ui/react-tabs            1.1.18    1.2.1    1.2.1  node_modules/@radix-ui/react-tabs           Relay
@radix-ui/react-toast           1.2.20    1.3.1    1.3.1  node_modules/@radix-ui/react-toast          Relay
@react-pdf/renderer              4.5.1    4.9.0    4.9.0  node_modules/@react-pdf/renderer            Relay
@tanstack/react-query          5.101.4  5.107.1  5.107.1  node_modules/@tanstack/react-query          Relay
@tanstack/react-table           8.21.3   8.21.3    9.3.1  node_modules/@tanstack/react-table          Relay
@trpc/client                   11.18.0  11.28.0  11.28.0  node_modules/@trpc/client                   Relay
@trpc/react-query              11.18.0  11.28.0  11.28.0  node_modules/@trpc/react-query              Relay
@trpc/server                   11.18.0  11.28.0  11.28.0  node_modules/@trpc/server                   Relay
@types/node                    22.20.1  22.20.5   26.6.6  node_modules/@types/node                    Relay
@types/react                   19.2.17   19.3.0   19.3.0  node_modules/@types/react                   Relay
@upstash/ratelimit               2.0.8    2.2.1    2.2.1  node_modules/@upstash/ratelimit             Relay
@upstash/redis                  1.38.0   1.41.0   1.41.0  node_modules/@upstash/redis                 Relay
autoprefixer                    10.5.4   10.6.2   10.6.2  node_modules/autoprefixer                   Relay
eslint                          9.39.5   9.39.5  10.15.0  node_modules/eslint                         Relay
eslint-config-next             15.5.21  15.5.29   16.4.6  node_modules/eslint-config-next             Relay
framer-motion                  11.18.2  11.18.2  14.14.0  node_modules/framer-motion                  Relay
lucide-react                   0.468.0  0.468.0   1.72.0  node_modules/lucide-react                   Relay
next                           15.5.21  15.5.29   16.4.6  node_modules/next                           Relay
openai                         4.104.0  4.104.0   6.49.0  node_modules/openai                         Relay
postcss                         8.5.22   8.5.32   8.5.32  node_modules/postcss                        Relay
prisma                          6.19.3   6.19.3   7.10.1  node_modules/prisma                         Relay
react                           19.2.8   19.3.1   19.3.1  node_modules/react                          Relay
react-dom                       19.2.8   19.3.1   19.3.1  node_modules/react-dom                      Relay
react-hook-form                 7.82.0   7.92.0   7.92.0  node_modules/react-hook-form                Relay
recharts                        2.15.4   2.15.4   3.10.1  node_modules/recharts                       Relay
resend                           4.8.0    4.8.0   6.38.1  node_modules/resend                         Relay
stripe                          17.7.0   17.7.0   23.1.0  node_modules/stripe                         Relay
svix                            1.98.0   1.99.1   1.99.1  node_modules/svix                           Relay
tailwind-merge                   2.6.1    2.6.1    3.7.0  node_modules/tailwind-merge                 Relay
tailwindcss                     3.4.19   3.4.19    4.3.5  node_modules/tailwindcss                    Relay
tsx                             4.23.1  4.23.15  4.23.15  node_modules/tsx                            Relay
typescript                       5.9.3    5.9.3    7.0.2  node_modules/typescript                     Relay
vitest                           2.1.9    2.1.9   4.1.12  node_modules/vitest                         Relay
zod                            3.25.76  3.25.76    4.6.7  node_modules/zod                            Relay
```

### 2026-11-13 — typecheck/test status: pass

### 2026-11-15 — dependency freshness
```
Package                        Current   Wanted   Latest  Location                                    Depended by
@anthropic-ai/sdk               0.30.1   0.30.1    1.8.0  node_modules/@anthropic-ai/sdk              Relay
@clerk/nextjs                   6.39.6   6.39.9   7.10.0  node_modules/@clerk/nextjs                  Relay
@hookform/resolvers             3.10.0   3.10.0    7.0.6  node_modules/@hookform/resolvers            Relay
@playwright/test                1.61.1   1.65.1   1.65.1  node_modules/@playwright/test               Relay
@prisma/client                  6.19.3   6.19.3   7.10.1  node_modules/@prisma/client                 Relay
@radix-ui/react-dialog          1.1.20    1.3.1    1.3.1  node_modules/@radix-ui/react-dialog         Relay
@radix-ui/react-dropdown-menu   2.1.21    2.2.1    2.2.1  node_modules/@radix-ui/react-dropdown-menu  Relay
@radix-ui/react-popover         1.1.20    1.3.1    1.3.1  node_modules/@radix-ui/react-popover        Relay
@radix-ui/react-select           2.3.4    2.4.1    2.4.1  node_modules/@radix-ui/react-select         Relay
@radix-ui/react-tabs            1.1.18    1.2.1    1.2.1  node_modules/@radix-ui/react-tabs           Relay
@radix-ui/react-toast           1.2.20    1.3.1    1.3.1  node_modules/@radix-ui/react-toast          Relay
@react-pdf/renderer              4.5.1    4.9.0    4.9.0  node_modules/@react-pdf/renderer            Relay
@tanstack/react-query          5.101.4  5.107.1  5.107.1  node_modules/@tanstack/react-query          Relay
@tanstack/react-table           8.21.3   8.21.3    9.3.1  node_modules/@tanstack/react-table          Relay
@trpc/client                   11.18.0  11.28.3  11.28.3  node_modules/@trpc/client                   Relay
@trpc/react-query              11.18.0  11.28.3  11.28.3  node_modules/@trpc/react-query              Relay
@trpc/server                   11.18.0  11.28.3  11.28.3  node_modules/@trpc/server                   Relay
@types/node                    22.20.1  22.20.5   26.6.6  node_modules/@types/node                    Relay
@types/react                   19.2.17   19.3.0   19.3.0  node_modules/@types/react                   Relay
@upstash/ratelimit               2.0.8    2.2.1    2.2.1  node_modules/@upstash/ratelimit             Relay
@upstash/redis                  1.38.0   1.41.0   1.41.0  node_modules/@upstash/redis                 Relay
autoprefixer                    10.5.4   10.6.2   10.6.2  node_modules/autoprefixer                   Relay
eslint                          9.39.5   9.39.5  10.15.0  node_modules/eslint                         Relay
eslint-config-next             15.5.21  15.5.29   16.4.6  node_modules/eslint-config-next             Relay
framer-motion                  11.18.2  11.18.2  14.14.0  node_modules/framer-motion                  Relay
lucide-react                   0.468.0  0.468.0   1.73.0  node_modules/lucide-react                   Relay
next                           15.5.21  15.5.29   16.4.6  node_modules/next                           Relay
openai                         4.104.0  4.104.0   6.49.0  node_modules/openai                         Relay
postcss                         8.5.22   8.5.33   8.5.33  node_modules/postcss                        Relay
prisma                          6.19.3   6.19.3   7.10.1  node_modules/prisma                         Relay
react                           19.2.8   19.3.1   19.3.1  node_modules/react                          Relay
react-dom                       19.2.8   19.3.1   19.3.1  node_modules/react-dom                      Relay
react-hook-form                 7.82.0   7.92.0   7.92.0  node_modules/react-hook-form                Relay
recharts                        2.15.4   2.15.4   3.10.1  node_modules/recharts                       Relay
resend                           4.8.0    4.8.0   6.38.1  node_modules/resend                         Relay
stripe                          17.7.0   17.7.0   23.1.0  node_modules/stripe                         Relay
svix                            1.98.0   1.99.1   1.99.1  node_modules/svix                           Relay
tailwind-merge                   2.6.1    2.6.1    3.7.0  node_modules/tailwind-merge                 Relay
tailwindcss                     3.4.19   3.4.19    4.3.5  node_modules/tailwindcss                    Relay
tsx                             4.23.1  4.23.15  4.23.15  node_modules/tsx                            Relay
typescript                       5.9.3    5.9.3    7.0.2  node_modules/typescript                     Relay
vitest                           2.1.9    2.1.9   4.1.12  node_modules/vitest                         Relay
zod                            3.25.76  3.25.76    4.6.7  node_modules/zod                            Relay
```

### 2026-11-15 — typecheck/test status: pass

