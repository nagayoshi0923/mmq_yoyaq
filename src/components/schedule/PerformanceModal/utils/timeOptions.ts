// 時間オプション生成ユーティリティ

// 30分間隔の時間オプションを生成
export const generateTimeOptions = (): string[] => {
  const options: string[] = []
  for (let hour = 9; hour <= 23; hour++) {
    for (let minute = 0; minute < 60; minute += 30) {
      const timeString = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`
      options.push(timeString)
    }
  }
  return options
}

export const timeOptions = generateTimeOptions()

