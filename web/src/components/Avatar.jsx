import { colorFor } from '../utils'

export default function Avatar({ name = '?', url, size = 36 }) {
  const style = { width: size, height: size, fontSize: size * 0.42 }
  if (url) {
    return <img className="avatar avatar-img" src={url} alt="" style={style} loading="lazy" />
  }
  return (
    <span className="avatar" style={{ ...style, background: colorFor(name) }} aria-hidden>
      {(name || '?').trim().charAt(0).toUpperCase()}
    </span>
  )
}
