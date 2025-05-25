import User from '#models/user'

import { ROLES } from '#models/role'
const hasRole =  (user: User, roleName:keyof typeof ROLES) => {
    user.roles = user.roles ?? [];
    return user.roles.some(role => role.name === roleName)
  }
  
const isAdmin = (user: User) =>hasRole(user,'ADMIN') || user.email == 'sublymus@gmail.com' || user.email == 'sablymus@gmail.com'
const isModerator = (user: User) =>hasRole(user,'MODERATOR')
const isOwnerRole = (user: User) =>hasRole(user,'OWNER')
const isCreatorRole = (user: User) =>hasRole(user,'CREATOR')
const isAffiliateRole = (user: User) =>hasRole(user,'AFFILIATE')

const isManager = (user: User) => isAdmin(user) || isModerator(user)

export const CHECK_ROLES = {
  isAdmin,
  isModerator,
  isOwnerRole,
  isCreatorRole,
  isAffiliateRole,
  isManager
} 