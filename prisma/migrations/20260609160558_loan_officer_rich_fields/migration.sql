/*
  Warnings:

  - You are about to drop the column `languages` on the `loan_officers` table. All the data in the column will be lost.
  - You are about to drop the column `ratingAvg` on the `loan_officers` table. All the data in the column will be lost.
  - You are about to drop the column `ratingCount` on the `loan_officers` table. All the data in the column will be lost.
  - You are about to drop the column `specialties` on the `loan_officers` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "loan_officers" DROP COLUMN "languages",
DROP COLUMN "ratingAvg",
DROP COLUMN "ratingCount",
DROP COLUMN "specialties",
ADD COLUMN     "applyUrl" TEXT,
ADD COLUMN     "bio" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "email" TEXT,
ADD COLUMN     "licensedStates" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "title" TEXT,
ALTER COLUMN "city" DROP NOT NULL,
ALTER COLUMN "state" DROP NOT NULL;
