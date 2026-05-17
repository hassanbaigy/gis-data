-- CreateTable
CREATE TABLE "Firefighter" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "badge" TEXT NOT NULL,
    "unitId" TEXT NOT NULL DEFAULT 'E-12',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Hydrant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "make" TEXT,
    "model" TEXT,
    "address" TEXT NOT NULL,
    "location" TEXT,
    "street" TEXT,
    "city" TEXT,
    "state" TEXT,
    "zip" TEXT,
    "inService" BOOLEAN NOT NULL DEFAULT true,
    "lat" REAL,
    "lng" REAL,
    "geocodedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Incident" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "address" TEXT NOT NULL,
    "lat" REAL NOT NULL,
    "lng" REAL NOT NULL,
    "type" TEXT NOT NULL,
    "alarmLevel" INTEGER NOT NULL,
    "notes" TEXT,
    "unitId" TEXT NOT NULL,
    "firefighterId" TEXT NOT NULL,
    "chosenHydrantId" TEXT,
    CONSTRAINT "Incident_firefighterId_fkey" FOREIGN KEY ("firefighterId") REFERENCES "Firefighter" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Incident_chosenHydrantId_fkey" FOREIGN KEY ("chosenHydrantId") REFERENCES "Hydrant" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Firefighter_badge_key" ON "Firefighter"("badge");

-- CreateIndex
CREATE INDEX "Hydrant_inService_idx" ON "Hydrant"("inService");

-- CreateIndex
CREATE INDEX "Hydrant_lat_lng_idx" ON "Hydrant"("lat", "lng");

-- CreateIndex
CREATE INDEX "Incident_createdAt_idx" ON "Incident"("createdAt");

-- CreateIndex
CREATE INDEX "Incident_firefighterId_idx" ON "Incident"("firefighterId");

-- CreateIndex
CREATE INDEX "Incident_type_idx" ON "Incident"("type");
