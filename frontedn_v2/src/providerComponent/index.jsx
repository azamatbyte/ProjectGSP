import React from 'react'
import { useSelector } from 'react-redux'

const ProviderComponent = ({ children, rolePermission }) => {
  const { role } = useSelector(state => state.auth)
  
  if (role) {
    const hasPermission = rolePermission.includes(role)
    
    // If children is a function (render prop pattern), call it with permission status
    if (typeof children === 'function') {
      return children(hasPermission)
    }
    
    // Original logic: render children if has permission, empty fragment if not
    if (hasPermission) {
      return children
    } else {
      return <></>
    }
  } else {
    return null
  }
}

export default ProviderComponent