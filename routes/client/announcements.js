const express = require('express');
const router = express.Router();
const { successResponse, errorResponse } = require('../../utils/response');
const { generateUniqueId } = require('../../utils/idGenerator');

/**
 * GET /api/client/announcements
 * 獲取所有活動更新
 */
router.get('/', async (req, res) => {
  try {
    const { prisma } = req.app.locals;
    const announcements = await prisma.announcement.findMany({
      orderBy: { createdAt: 'desc' },
    });

    return successResponse(res, announcements);
  } catch (error) {
    console.error('[Announcements API] 獲取活動更新列表失敗:', error);
    return errorResponse(res, '獲取活動更新列表失敗', null, 500);
  }
});

/**
 * POST /api/client/announcements
 * 創建活動更新
 */
router.post('/', async (req, res) => {
  try {
    const { prisma } = req.app.locals;
    const { title, content, type, isVisible } = req.body;

    if (!title || !title.trim()) {
      return errorResponse(res, '請輸入標題', null, 400);
    }

    if (!content || !content.trim()) {
      return errorResponse(res, '請輸入內容', null, 400);
    }

    if (!type || (type !== '活動' && type !== '更新')) {
      return errorResponse(res, '請選擇類型（活動或更新）', null, 400);
    }

    // 如果設置為顯示，自動取消其他同類型的顯示狀態
    if (isVisible) {
      await prisma.announcement.updateMany({
        where: {
          type: type,
          isVisible: true,
        },
        data: {
          isVisible: false,
        },
      });
    }

    // 生成唯一的6位數字ID
    const announcementId = await generateUniqueId(async (id) => {
      const exists = await prisma.announcement.findUnique({
        where: { announcementId: id },
      });
      return !exists;
    });

    // 創建活動更新
    const announcement = await prisma.announcement.create({
      data: {
        announcementId,
        title: title.trim(),
        content: content.trim(),
        type,
        isVisible: isVisible || false,
      },
    });

    return successResponse(res, announcement, '活動更新創建成功');
  } catch (error) {
    console.error('[Announcements API] 創建活動更新失敗:', error);
    return errorResponse(res, '創建活動更新失敗', null, 500);
  }
});

/**
 * GET /api/client/announcements/:id
 * 獲取單個活動更新
 */
router.get('/:id', async (req, res) => {
  try {
    const { prisma } = req.app.locals;
    const { id } = req.params;
    const announcement = await prisma.announcement.findUnique({
      where: { id },
    });

    if (!announcement) {
      return errorResponse(res, '活動更新不存在', null, 404);
    }

    return successResponse(res, announcement);
  } catch (error) {
    console.error('[Announcements API] 獲取活動更新失敗:', error);
    return errorResponse(res, '獲取活動更新失敗', null, 500);
  }
});

/**
 * PATCH /api/client/announcements/:id
 * 更新活動更新
 */
router.patch('/:id', async (req, res) => {
  try {
    const { prisma } = req.app.locals;
    const { id } = req.params;
    const { title, content, type, isVisible } = req.body;

    // 獲取當前活動更新
    const currentAnnouncement = await prisma.announcement.findUnique({
      where: { id },
    });

    if (!currentAnnouncement) {
      return errorResponse(res, '活動更新不存在', null, 404);
    }

    // 如果設置為顯示，自動取消其他同類型的顯示狀態（排除自己）
    if (isVisible && (type !== undefined || isVisible !== currentAnnouncement.isVisible)) {
      const checkType = type || currentAnnouncement.type;
      await prisma.announcement.updateMany({
        where: {
          type: checkType,
          isVisible: true,
          id: { not: id },
        },
        data: {
          isVisible: false,
        },
      });
    }

    const updateData = {};
    if (title !== undefined) {
      updateData.title = title.trim();
    }
    if (content !== undefined) {
      updateData.content = content.trim();
    }
    if (type !== undefined) {
      updateData.type = type;
    }
    if (isVisible !== undefined) {
      updateData.isVisible = isVisible;
    }

    const announcement = await prisma.announcement.update({
      where: { id },
      data: updateData,
    });

    return successResponse(res, announcement, '活動更新更新成功');
  } catch (error) {
    console.error('[Announcements API] 更新活動更新失敗:', error);
    return errorResponse(res, '更新活動更新失敗', null, 500);
  }
});

/**
 * DELETE /api/client/announcements/:id
 * 刪除活動更新
 */
router.delete('/:id', async (req, res) => {
  try {
    const { prisma } = req.app.locals;
    const { id } = req.params;
    await prisma.announcement.delete({
      where: { id },
    });

    return successResponse(res, null, '活動更新刪除成功');
  } catch (error) {
    console.error('[Announcements API] 刪除活動更新失敗:', error);
    return errorResponse(res, '刪除活動更新失敗', null, 500);
  }
});

module.exports = router;

