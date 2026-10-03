/* A saved message stays saved even if its best-effort notification wake fails. */
window.GrinderFeedbackWake = async function (auth) {
  try {
    const {data} = await auth.getSession();
    const token = data?.session?.access_token;
    if (!token) return false;
    const response = await fetch('/api/feedback-notifications', {
      method: 'POST', headers: {Authorization: 'Bearer '+token}, redirect: 'error',
    });
    return response.ok;
  } catch (_) { return false; }
};
