import { useContext } from "react";
import { AuthContext } from "./auth-store";

export const useAuth = () => {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider.");
  return value;
};
