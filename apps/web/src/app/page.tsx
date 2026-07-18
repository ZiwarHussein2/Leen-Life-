"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { api, getToken, homeFor, type Me } from "@/lib/api";

export default function Home() {
  const router = useRouter();
  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    api<Me>("/auth/me")
      .then((me) => router.replace(homeFor(me.role.key)))
      .catch(() => router.replace("/login"));
  }, [router]);
  return null;
}
