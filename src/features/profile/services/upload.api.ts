import api from "@/core/api/axios"

// ── Types ────────────────────────────────────────────────────

export type UploadType = "profile" | "cover" | "posts" | "organization_logo" | "organization_cover"

export type UploadConfigItem = {
  upload_url: string
  api_key: string
  cloud_name: string
  timestamp: number
  signature: string
  folder: string
  public_id: string
  overwrite: string
}

export type UploadSignatureResponse = {
  provider: string
  temp_post_id?: string
  uploads: UploadConfigItem[]
}

export type UpdateMediaPayload = {
  profile_photo?: string
  profile_photo_public_id?: string
  cover_photo?: string
  cover_photo_public_id?: string
}

// ── Step 1: Get signed upload config from backend ─────────────

export const getUploadSignatureApi = async (
  type:    UploadType,
  count    = 1,
  org_id?: string,         
): Promise<UploadSignatureResponse> => {
  const res = await api.get("/user/get/upload/signature", {
    params: {
      type,
      count,
      ...(org_id ? { org_id } : {}),   
    },
  })
  return res.data.data
}


// ── Step 2: Upload file directly to Cloudinary ───────────────
export const uploadToCloudinaryApi = async (
  file: File,
  sig: UploadConfigItem
): Promise<{ secure_url: string; public_id: string }> => {
  const form = new FormData()

  form.append("file", file)
  form.append("api_key", sig.api_key)
  form.append("timestamp", String(sig.timestamp))
  form.append("signature", sig.signature)
  form.append("folder", sig.folder)
  form.append("public_id", sig.public_id)
  form.append("overwrite", sig.overwrite)

  //  auto detect (image/video)
  const res = await fetch(sig.upload_url, {
    method: "POST",
    body: form,
  })

  if (!res.ok) throw new Error("upload failed please try again later")

  const data = await res.json()

  return {
    secure_url: data.secure_url,
    public_id: data.public_id,
  }
}

// ── Step 3: Save URL to backend ──────────────────────────────
export const updateMediaApi = async (
  payload: UpdateMediaPayload
): Promise<void> => {
  await api.post("/user/update/profile/cover", payload)
}