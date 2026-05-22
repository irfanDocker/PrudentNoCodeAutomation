import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("PrudentQA!123", 12);

  const admin = await prisma.user.upsert({
    where: { email: "admin@prudentqa.local" },
    update: {},
    create: {
      email: "admin@prudentqa.local",
      name: "Prudent QA Admin",
      passwordHash,
      role: "ADMIN"
    }
  });

  const project = await prisma.project.upsert({
    where: { projectKey: "PRUDENT" },
    update: {},
    create: {
      name: "Prudent Demo Project",
      projectKey: "PRUDENT",
      baseUrl: "https://example.com",
      environments: {
        qa: "https://example.com",
        staging: "https://staging.example.com",
        production: "https://example.com"
      }
    }
  });

  const testCase = await prisma.testCase.create({
    data: {
      projectId: project.id,
      title: "Example homepage smoke test",
      description: "Confirms that the homepage opens and visible copy can be checked.",
      groupType: "SMOKE",
      priority: "HIGH",
      status: "READY",
      tags: ["smoke", "homepage"],
      createdById: admin.id,
      updatedById: admin.id,
      steps: {
        create: [
          {
            stepNumber: 1,
            actionType: "goto",
            inputValue: "/",
            expectedResult: "Homepage opens",
            timeoutMs: 10000
          },
          {
            stepNumber: 2,
            actionType: "verify_text",
            locatorType: "text",
            locatorValue: "Example Domain",
            expectedResult: "Example Domain",
            timeoutMs: 10000
          },
          {
            stepNumber: 3,
            actionType: "screenshot",
            expectedResult: "Screenshot captured"
          }
        ]
      }
    }
  });

  const suite = await prisma.testSuite.create({
    data: {
      projectId: project.id,
      name: "Smoke Test",
      suiteType: "SMOKE",
      description: "Fast confidence suite for CI and release gates.",
      createdById: admin.id,
      testCases: {
        create: {
          testCaseId: testCase.id,
          sortOrder: 1
        }
      }
    }
  });

  console.log(`Seeded ${project.name}, ${testCase.title}, and ${suite.name}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

