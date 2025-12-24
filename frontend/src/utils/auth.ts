export const dispatchUnauthorized = () => {
  window.dispatchEvent(new Event("ttrpg:unauthorized"));
};
