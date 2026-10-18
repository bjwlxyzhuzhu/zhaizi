import { theme } from 'antd'

const font = "'Noto Sans SC','PingFang SC','Microsoft YaHei',sans-serif"

export const darkTheme = {
  algorithm: theme.darkAlgorithm,
  token: {
    colorPrimary: '#3F8F7A',
    colorLink: '#6FB3A0',
    colorWarning: '#C9A45C',
    colorError: '#B5452F',
    colorBgBase: '#0B0F0E',
    colorBgContainer: '#131A18',
    colorBgElevated: '#18211E',
    colorBorder: '#2A3733',
    colorBorderSecondary: '#24302C',
    colorText: '#E6E2D6',
    colorTextSecondary: '#9AA39E',
    borderRadius: 10,
    fontFamily: font,
  },
}

export const paperTheme = {
  inherit: false,
  algorithm: theme.defaultAlgorithm,
  token: {
    colorPrimary: '#2F6F5E',
    colorLink: '#2F6F5E',
    colorWarning: '#B7893A',
    colorError: '#B5452F',
    colorBgBase: '#FBFAF6',
    colorBgContainer: '#FFFFFF',
    colorBgElevated: '#FFFFFF',
    colorBorder: '#DCD8CA',
    colorBorderSecondary: '#E3E0D4',
    colorText: '#23302B',
    colorTextSecondary: '#58655E',
    colorTextPlaceholder: '#737C76',
    borderRadius: 10,
    fontFamily: font,
  },
}

/** 图谱节点类型与颜色（PRD KG-2） */
export const NODE_COLORS: Record<string, string> = {
  器: '#C9A45C', // 青铜金
  铭: '#A0522D', // 赭石
  字: '#3FA08A', // 铜锈青
  字形: '#8FD3C4', // 浅青
  音: '#DCE6F0', // 月白
  义: '#C8432E', // 朱砂
  人: '#E3A33B', // 琥珀
  事: '#8C7AA6', // 灰紫
  地: '#3B6B4A', // 墨绿
  文献: '#EFE6CF', // 象牙
  礼制: '#A8862F', // 深金
}
