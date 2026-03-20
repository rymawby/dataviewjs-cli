async function greeting(tp) {
  const alphaExists = await tp.file.exists("Projects/Alpha");
  return `Hello ${tp.file.title} (${alphaExists})`;
}

module.exports = greeting;
