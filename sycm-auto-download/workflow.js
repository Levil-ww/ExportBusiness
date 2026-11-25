// 与页面操作及下载监测解耦，先确认商品下载成功，才允许进入内容模块。
async function sycmRunWorkflow(schedule, operations) {
  const result = { product: null, content: null };
  try {
    await operations.openProduct();
    await operations.prepareProduct(schedule.product);
    result.product = await operations.downloadProduct();
    if (!result.product || result.product.state !== 'complete') throw new Error('商品下载未完成');
    if (schedule.content) {
      await operations.openContent();
      await operations.prepareContent(schedule.content);
      result.content = await operations.downloadContent();
      if (!result.content || result.content.state !== 'complete') throw new Error('内容下载未完成');
    }
    return { status: 'complete', ...result };
  } catch (error) {
    return { status: 'failed', ...result, error: error && error.message ? error.message : String(error) };
  }
}
if (typeof module !== 'undefined') module.exports = { sycmRunWorkflow };
