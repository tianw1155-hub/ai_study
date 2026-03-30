// Template Handler - GET /api/templates
package handlers

import (
	"encoding/json"
	"net/http"
)

// Template represents a project template.
type Template struct {
	ID          string `json:"id"`
	Title       string `json:"title"`
	Description string `json:"description"`
	Prompt      string `json:"prompt"`
}

// TemplatesResponse represents the response for templates API.
type TemplatesResponse struct {
	Templates []Template `json:"templates"`
}

// templates is the hardcoded list of project templates.
var templates = []Template{
	{
		ID:          "1",
		Title:       "用户认证模块",
		Description: "包含登录/注册/找回密码",
		Prompt:       "创建一个完整的用户认证模块，包括：1) 用户注册功能（邮箱验证）2) 用户登录功能（JWT token）3) 密码找回功能（邮件验证码）4) 登录状态管理 5) 权限中间件",
	},
	{
		ID:          "2",
		Title:       "RESTful API 服务",
		Description: "标准 CRUD 接口",
		Prompt:       "创建一个标准 RESTful API 服务，包括：1) 资源的增删改查接口 2) 分页和排序支持 3) 统一错误处理 4) 请求参数验证 5) API 文档注解",
	},
	{
		ID:          "3",
		Title:       "React 组件库",
		Description: "常用 UI 组件",
		Prompt:       "创建一个 React 组件库，包含：1) Button 按钮组件（多种状态和变体）2) Input 输入框组件 3) Modal 弹窗组件 4) Table 表格组件（支持排序和分页）5) 表单组件（带验证）",
	},
	{
		ID:          "4",
		Title:       "数据可视化仪表盘",
		Description: "图表和数据展示",
		Prompt:       "创建一个数据可视化仪表盘，包括：1) ECharts 图表集成（折线图/柱状图/饼图）2) 数据筛选器 3) 实时数据更新 4) 响应式布局 5) 主题切换功能",
	},
	{
		ID:          "5",
		Title:       "博客系统",
		Description: "文章管理和评论功能",
		Prompt:       "创建一个博客系统，包括：1) 文章发布和编辑（Markdown 支持）2) 评论系统 3) 分类和标签管理 4) 搜索功能 5) 用户个人主页",
	},
	{
		ID:          "6",
		Title:       "电商购物车",
		Description: "商品结算流程",
		Prompt:       "创建一个电商购物车模块，包括：1) 商品列表展示 2) 购物车增减操作 3) 价格计算（折扣/运费）4) 订单确认流程 5) 结算页面",
	},
}

// HandleTemplates handles GET /api/templates
// Returns a list of hardcoded project templates.
func HandleTemplates(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
		return
	}

	resp := TemplatesResponse{
		Templates: templates,
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(resp)
}

// GetTemplates returns the template list (for internal use).
func GetTemplates() []Template {
	result := make([]Template, len(templates))
	copy(result, templates)
	return result
}
