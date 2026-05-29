import {
  createAdminClient,
  createClient
} from "./chunk-KWPVUZIW.mjs";
import {
  __name,
  init_esm
} from "./chunk-EEXUIEOC.mjs";

// src/lib/services/notifications-service.ts
init_esm();
async function getUnreadNotifications(userId) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("notifications").select("*").eq("recipient_id", userId).is("read_at", null).order("created_at", { ascending: false }).limit(20);
  if (error) {
    console.error("[notifications-service] getUnreadNotifications error:", error);
    return [];
  }
  return data ?? [];
}
__name(getUnreadNotifications, "getUnreadNotifications");
async function getNotifications(userId) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("notifications").select("*").eq("recipient_id", userId).order("created_at", { ascending: false }).limit(50);
  if (error) {
    console.error("[notifications-service] getNotifications error:", error);
    return [];
  }
  return data ?? [];
}
__name(getNotifications, "getNotifications");
async function markNotificationRead(id, userId) {
  const supabase = await createClient();
  const { error } = await supabase.from("notifications").update({ read_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", id).eq("recipient_id", userId).is("read_at", null);
  if (error) {
    console.error("[notifications-service] markNotificationRead error:", error);
    return { error: "Failed to mark notification as read." };
  }
  return { error: null };
}
__name(markNotificationRead, "markNotificationRead");
async function markAllNotificationsRead(userId) {
  const supabase = await createClient();
  const { error } = await supabase.from("notifications").update({ read_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("recipient_id", userId).is("read_at", null);
  if (error) {
    console.error("[notifications-service] markAllNotificationsRead error:", error);
    return { error: "Failed to mark all notifications as read." };
  }
  return { error: null };
}
__name(markAllNotificationsRead, "markAllNotificationsRead");
async function createNotification(payload) {
  const admin = createAdminClient();
  const { error } = await admin.from("notifications").insert({
    recipient_id: payload.recipient_id,
    type: payload.type,
    title: payload.title,
    body: payload.body ?? null,
    action_url: payload.action_url ?? null
  });
  if (error) {
    console.error("[notifications-service] createNotification error:", error);
    return { error: "Failed to create notification." };
  }
  return { error: null };
}
__name(createNotification, "createNotification");

export {
  getUnreadNotifications,
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  createNotification
};
//# sourceMappingURL=chunk-Y5JLKEHJ.mjs.map
