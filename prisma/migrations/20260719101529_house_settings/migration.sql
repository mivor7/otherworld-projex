-- CreateTable
CREATE TABLE "HouseSetting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HouseSetting_pkey" PRIMARY KEY ("key")
);
