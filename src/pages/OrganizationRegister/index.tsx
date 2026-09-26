import { Navigate } from 'react-router-dom'

/** Legacy registration links use the same verified signup flow as /start. */
export default function OrganizationRegister() {
  return <Navigate to="/start" replace />
}
