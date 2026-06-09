import "server-only";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";

const BUCKET = process.env.OFFICERS_S3_BUCKET ?? "msfg.us";
const KEY = process.env.OFFICERS_S3_KEY ?? "rag-brain/MSFG_Loan_Officers.md";
const REGION = process.env.OFFICERS_S3_REGION ?? "us-west-1";

/** Read the roster markdown from S3. AWS creds come from the default chain. */
export async function fetchOfficersMarkdown(): Promise<string> {
  const s3 = new S3Client({ region: REGION });
  const out = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: KEY }));
  if (!out.Body) throw new Error(`Empty S3 object: ${BUCKET}/${KEY}`);
  return out.Body.transformToString();
}
