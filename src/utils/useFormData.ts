export const useFormData = () => {

  const cleaned = (data: string) => {
    return data.replace(/^\d+/, '') // 去掉前面的数字
  }

  const formSendData = (data: string) => {
    const cleanedData = cleaned(data)
    try {
      const parsed = JSON.parse(cleanedData)

      // 拿到 requestParameter 对象
      const { url, requestHeader, requestBody, com } = parsed[1]
      return JSON.stringify({
        url,
        requestHeader,
        requestBody,
        com
      })
    } catch (e) {
      return data
    }

  }

  const formReceiveData = (data: string) => {
    const cleanedData = cleaned(data)
    try {
      const parsed = JSON.parse(cleanedData)

      // 拿到 requestParameter 对象
      const { url, requestHeader, requestBody, com } = parsed[1].requestParameter

      // 拿到外层 data
      const outerData = parsed[1].data || {}
      const errorDetail = parsed[1].detail || {}
      return JSON.stringify({
        url,
        requestHeader,
        requestBody,
        com,
        data: outerData,
        errorDetail
      })
    } catch (e) {
      return data
    }

  }
  return {
    formSendData,
    formReceiveData
  }
}
