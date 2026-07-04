async function assertNoHorizontalScroll(page, label = 'page') {
  const result = await page.evaluate(() => {
    const doc = document.documentElement;
    const body = document.body;

    return {
      documentScrollWidth: doc.scrollWidth,
      documentClientWidth: doc.clientWidth,
      bodyScrollWidth: body ? body.scrollWidth : 0,
      bodyClientWidth: body ? body.clientWidth : 0
    };
  });

  const docOverflow = result.documentScrollWidth - result.documentClientWidth;
  const bodyOverflow = result.bodyScrollWidth - result.bodyClientWidth;
  const overflow = Math.max(docOverflow, bodyOverflow);

  if (overflow > 2) {
    throw new Error(
      `${label} has horizontal overflow: ${overflow}px ` +
      `(document ${result.documentScrollWidth}/${result.documentClientWidth}, ` +
      `body ${result.bodyScrollWidth}/${result.bodyClientWidth})`
    );
  }
}

async function assertCriticalContentVisible(page) {
  const bodyText = await page.locator('body').innerText({ timeout: 5000 });

  if (!bodyText || bodyText.trim().length < 10) {
    throw new Error('Page body appears empty or unusable.');
  }
}

module.exports = {
  assertNoHorizontalScroll,
  assertCriticalContentVisible
};
