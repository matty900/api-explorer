// Manages the ApiSubmission holding area: community submitted APIs land here
// as "pending" and only reach the live Api catalog (via addApi) once a
// maintainer approves them. Nothing in here is ever read by search/proxy.

import { addApi, validateApiSubmission } from "./addApi";
import { prisma } from "./db";

export type SubmissionStatus = "pending" | "approved" | "rejected";

export type CreateSubmissionResult =
  | { ok: true; id: string }
  | { ok: false; errors: string[] };

const MAX_EMAIL_LENGTH = 200;

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

/** Validates and stores a community submission as "pending". Never touches the Api table. */
export async function createSubmission(
  input: unknown,
  submitterEmail?: unknown,
): Promise<CreateSubmissionResult> {
  const validation = validateApiSubmission(input);
  if (!validation.ok) return { ok: false, errors: validation.errors };

  const entry = validation.value;
  const email = isNonEmptyString(submitterEmail)
    ? submitterEmail.trim().slice(0, MAX_EMAIL_LENGTH)
    : undefined;

  const submission = await prisma.apiSubmission.create({
    data: {
      name: entry.name,
      description: entry.description,
      category: entry.category,
      authType: entry.authType,
      baseUrl: entry.baseUrl,
      docsUrl: entry.docsUrl,
      tags: entry.tags,
      endpoints: entry.endpoints as any,
      submitterEmail: email,
      status: "pending",
    },
  });

  return { ok: true, id: submission.id };
}

export function listSubmissions(status: SubmissionStatus = "pending") {
  return prisma.apiSubmission.findMany({
    where: { status },
    orderBy: { createdAt: "asc" },
  });
}

export type ApproveSubmissionResult =
  | { ok: true; apiId: string }
  | { ok: false; errors: string[] };

export async function approveSubmission(
  submissionId: string,
): Promise<ApproveSubmissionResult> {
  const submission = await prisma.apiSubmission.findUnique({
    where: { id: submissionId },
  });
  if (!submission) return { ok: false, errors: ["submission not found"] };
  if (submission.status !== "pending") {
    return {
      ok: false,
      errors: [`submission is already ${submission.status}`],
    };
  }

  const result = await addApi({
    name: submission.name,
    description: submission.description,
    category: submission.category,
    authType: submission.authType,
    baseUrl: submission.baseUrl,
    docsUrl: submission.docsUrl,
    tags: submission.tags,
    endpoints: submission.endpoints,
  });
  if (!result.ok) return { ok: false, errors: result.errors };

  await prisma.apiSubmission.update({
    where: { id: submissionId },
    data: { status: "approved", reviewedAt: new Date() },
  });

  return { ok: true, apiId: result.api.id };
}

export async function rejectSubmission(
  submissionId: string,
  reviewNote?: string,
): Promise<{ ok: true } | { ok: false; errors: string[] }> {
  const submission = await prisma.apiSubmission.findUnique({
    where: { id: submissionId },
  });
  if (!submission) return { ok: false, errors: ["submission not found"] };
  if (submission.status !== "pending") {
    return {
      ok: false,
      errors: [`submission is already ${submission.status}`],
    };
  }

  await prisma.apiSubmission.update({
    where: { id: submissionId },
    data: {
      status: "rejected",
      reviewedAt: new Date(),
      reviewNote: isNonEmptyString(reviewNote)
        ? reviewNote.slice(0, 500)
        : undefined,
    },
  });

  return { ok: true };
}
