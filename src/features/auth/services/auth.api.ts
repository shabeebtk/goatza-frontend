import api from "@/core/api/axios"

export const loginApi = async (data: {
  email: string
  password: string
}) => {
  const res = await api.post("/user/login", data)

  return res.data.data 
}

export const logoutApi = async () => {
  await api.post("/user/logout")
}

export const refreshApi = async () => {
  const res = await api.post("/user/token/refresh")

  return res.data.data 
}

export const getUserApi = async () => {
  const res = await api.get("/user/details")

  return res.data.data 
}