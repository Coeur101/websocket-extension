const cleaned = (data: string) => {
  return data.replace(/^\d+/, '') // 去掉前面的数字
}

export const formSendData = (data: string) => {
  const cleanedData = cleaned(data)
  try {
    const parsed = JSON.parse(cleanedData)

    // 拿到 requestParameter 对象
    const { url, requestHeader, requestBody, com } = parsed[1]
    return {
      url,
      requestHeader,
      requestBody,
      state: false,
      com
    }
  } catch (e) {
    return data
  }

}

export const formReceiveData = (data: string) => {
  const cleanedData = cleaned(data)
  try {
    const parsed = JSON.parse(cleanedData)

    // 拿到 requestParameter 对象
    const { url, requestHeader, requestBody, com } = parsed[1].requestParameter

    // 拿到外层 data
    const outerData = parsed[1].data || {}
    const errorDetail = parsed[1].detail || {}
    const state = outerData ? true : false
    return {
      url,
      requestHeader,
      requestBody,
      state,
      com,
      data: outerData,
      errorDetail
    }
  } catch (e) {
    return data
  }

}
