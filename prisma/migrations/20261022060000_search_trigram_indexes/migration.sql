-- CreateIndex
CREATE INDEX "Account_name_trgm_idx" ON "Account" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Account_domain_trgm_idx" ON "Account" USING GIN ("domain" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Account_city_trgm_idx" ON "Account" USING GIN ("city" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Contact_email_trgm_idx" ON "Contact" USING GIN ("email" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Contact_lastName_trgm_idx" ON "Contact" USING GIN ("lastName" gin_trgm_ops);
