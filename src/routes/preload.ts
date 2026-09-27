// Shared by React.lazy and intent handlers. Failed speculative imports are
// ignored by the handler; navigating still uses the normal route error boundary.
export const loadDealDetail = () => import("@/pages/DealDetail");
