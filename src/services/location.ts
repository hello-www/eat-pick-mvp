import { getMockLocation } from "../data/mockPlaces";
import type { GeoLocation } from "../types";

export type LocationStatus = "idle" | "loading" | "ready" | "denied" | "timeout" | "fallback";

export async function getBrowserLocation(): Promise<{
  location: GeoLocation;
  status: LocationStatus;
  message: string;
}> {
  if (!("geolocation" in navigator)) {
    return {
      location: getMockLocation(),
      status: "fallback",
      message: "浏览器不支持定位，已进入模拟位置模式。",
    };
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          location: {
            lng: position.coords.longitude,
            lat: position.coords.latitude,
            label: "当前位置",
          },
          status: "ready",
          message: "已获取当前位置。",
        });
      },
      (error) => {
        const isTimeout = error.code === error.TIMEOUT;
        resolve({
          location: getMockLocation(),
          status: isTimeout ? "timeout" : "denied",
          message: isTimeout
            ? "定位超时，暂时使用模拟附近数据。"
            : "未获得定位权限，暂时使用模拟附近数据。",
        });
      },
      {
        enableHighAccuracy: true,
        timeout: 7000,
        maximumAge: 1000 * 60 * 5,
      },
    );
  });
}
