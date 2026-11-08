/**
 * One org photo, end to end, with the org named on every request — the create
 * page runs this while still acting as the person.
 */

import { beforeEach, describe, expect, it, vi } from "vitest"

const m = vi.hoisted(() => ({
  compressImage: vi.fn(),
  preferredImageType: vi.fn(),
  getUploadConfigApi: vi.fn(),
  putToR2: vi.fn(),
  post: vi.fn(),
  order: [] as string[],
}))

vi.mock("@/shared/services/imageVariants", () => ({
  compressImage: m.compressImage,
  preferredImageType: m.preferredImageType,
}))

vi.mock("@/shared/services/mediaUpload", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/shared/services/mediaUpload")>()),
  getUploadConfigApi: m.getUploadConfigApi,
  putToR2: m.putToR2,
}))

vi.mock("@/core/api/axios", () => ({ default: { post: m.post } }))

import { uploadOrgPhoto } from "./uploadOrgPhoto"

const ENTRY = {
  key: "organizations/org-1/logo.webp",
  public_url: "https://media.example.com/organizations/org-1/logo.webp",
  upload_url: "https://r2.example.com/signed",
  method: "PUT",
  headers: {},
  expires_at: Date.now() + 60_000,
}

beforeEach(() => {
  vi.clearAllMocks()
  m.order.length = 0
  m.preferredImageType.mockResolvedValue("image/webp")
  m.compressImage.mockImplementation(async (file: File) => {
    m.order.push("compress")
    return new File([file], "logo.webp", { type: "image/webp" })
  })
  m.getUploadConfigApi.mockImplementation(async () => {
    m.order.push("sign")
    return { uploads: [ENTRY] }
  })
  m.putToR2.mockImplementation(async () => { m.order.push("put") })
  m.post.mockImplementation(async () => {
    m.order.push("attach")
    return { data: { success: true, data: { logo: `${ENTRY.public_url}?v=7`, cover_image: "" } } }
  })
})

describe("uploadOrgPhoto", () => {
  it("compresses, signs for the org, PUTs, attaches, and returns the stored URL", async () => {
    const url = await uploadOrgPhoto({
      orgId: "org-1",
      type: "logo",
      blob: new Blob(["cropped"], { type: "image/jpeg" }),
      originalName: "badge.jpg",
    })

    expect(m.order).toEqual(["compress", "sign", "put", "attach"])
    expect(m.compressImage.mock.calls[0][1]).toMatchObject({ fileType: "image/webp" })
    expect(m.getUploadConfigApi).toHaveBeenCalledWith(
      "organization_logo",
      [expect.objectContaining({ kind: "image" })],
      "org-1",
      undefined
    )
    expect(m.post).toHaveBeenCalledWith(
      "/organizations/update/logo/cover",
      { logo: ENTRY.public_url, logo_public_id: ENTRY.key },
      expect.objectContaining({ params: { org_id: "org-1" } })
    )
    expect(url).toBe(`${ENTRY.public_url}?v=7`)
  })

  it("attaches a cover to the cover fields", async () => {
    m.post.mockResolvedValue({ data: { success: true, data: {} } })

    const url = await uploadOrgPhoto({
      orgId: "org-1",
      type: "cover",
      blob: new Blob(["cropped"], { type: "image/jpeg" }),
      originalName: "cover.png",
    })

    expect(m.getUploadConfigApi.mock.calls[0][0]).toBe("organization_cover")
    expect(m.post.mock.calls[0][1]).toEqual({
      cover_image: ENTRY.public_url,
      cover_image_public_id: ENTRY.key,
    })
    // An older server sends nothing back: a cache-busted URL of our own.
    expect(url.startsWith(`${ENTRY.public_url}?v=`)).toBe(true)
  })

  it("fails when the server signs nothing", async () => {
    m.getUploadConfigApi.mockResolvedValue({ uploads: [] })

    await expect(
      uploadOrgPhoto({ orgId: "org-1", type: "logo", blob: new Blob(["x"]), originalName: "x.jpg" })
    ).rejects.toThrow("Couldn't start the upload. Try again.")
    expect(m.putToR2).not.toHaveBeenCalled()
  })
})
