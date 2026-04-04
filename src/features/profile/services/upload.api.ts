import api from "@/core/api/axios"

// ── Types ────────────────────────────────────────────────────

export type UploadType = "profile" | "cover"

export type UploadSignature = {
  provider: string
  upload_url: string
  api_key: string
  cloud_name: string
  timestamp: number
  signature: string
  folder: string
  public_id: string
  overwrite: boolean
}

export type UpdateMediaPayload = {
  profile_photo?: string
  profile_photo_public_id?: string
  cover_photo?: string
  cover_photo_public_id?: string
}

// ── Step 1: Get signed upload config from backend ─────────────
export const getUploadSignatureApi = async (
  type: UploadType
): Promise<UploadSignature> => {
  const res = await api.get("/user/get/upload/signature", { params: { type } })
  return res.data.data
}

// ── Step 2: Upload file directly to Cloudinary ───────────────
export const uploadToCloudinaryApi = async (
  file: File,
  sig: UploadSignature
): Promise<{ secure_url: string; public_id: string }> => {
  const form = new FormData()
  form.append("file", file)
  form.append("api_key", sig.api_key)
  form.append("timestamp", String(sig.timestamp))
  form.append("signature", sig.signature)
  form.append("folder", sig.folder)
  form.append("public_id", sig.public_id)
  form.append("overwrite", String(sig.overwrite))
  form.append("resource_type", "image")
  form.append("invalidate", "true")

  const res = await fetch(sig.upload_url, { method: "POST", body: form })
  if (!res.ok) throw new Error("Cloudinary upload failed")
  const data = await res.json()
  return { secure_url: data.secure_url, public_id: data.public_id }
}

// ── Step 3: Save URL to backend ──────────────────────────────
export const updateMediaApi = async (
  payload: UpdateMediaPayload
): Promise<void> => {
  await api.post("/user/update/profile/cover", payload)
}