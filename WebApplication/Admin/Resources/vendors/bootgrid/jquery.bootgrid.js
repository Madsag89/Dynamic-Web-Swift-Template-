/*! 
 * jQuery Bootgrid v1.1.4 - 11/23/2014
 * Copyright (c) 2014 Rafael Staib (http://www.jquery-bootgrid.com)
 * Licensed under MIT http://www.opensource.org/licenses/MIT
 */
;(function ($, window, undefined)
{
    /*jshint validthis: true */
    "use strict";

    // GRID INTERNAL FIELDS
    // ====================

    var namespace = ".rs.jquery.bootgrid";

    // GRID INTERNAL FUNCTIONS
    // =====================

    function appendRow(row)
    {
        var that = this;

        function exists(item)
        {
            return that.identifier && item[that.identifier] === row[that.identifier];
        }

        if (!this.rows.contains(exists))
        {
            this.rows.push(row);
            return true;
        }

        return false;
    }

    function getParams(context)
    {
        return (context) ? $.extend({}, this.cachedParams, { ctx: context }) : 
            this.cachedParams;
    }

    function getRequest()
    {
        var request = {
                current: this.current,
                rowCount: this.rowCount,
                sort: this.sort,
                searchPhrase: this.searchPhrase
            },
            post = this.options.post;

        post = ($.isFunction(post)) ? post() : post;
        return this.options.requestHandler($.extend(true, request, post));
    }

    function getCssSelector(css)
    {
        return "." + $.trim(css).replace(/\s+/gm, ".");
    }

    function getUrl()
    {
        var url = this.options.url;
        return ($.isFunction(url)) ? url() : url;
    }

    function init()
    {
        this.element.trigger("initialize" + namespace);

        loadColumns.call(this); // Loads columns from HTML thead tag
        this.selection = this.options.selection && this.identifier != null;
        loadRows.call(this); // Loads rows from HTML tbody tag if ajax is false
        prepareTable.call(this);
        renderTableHeader.call(this);
        renderSearchField.call(this);
        renderActions.call(this);
        loadData.call(this);

        this.element.trigger("initialized" + namespace);
    }

    function highlightAppendedRows(rows)
    {
        if (this.options.highlightRows)
        {
            // todo: implement
        }
    }

    function isVisible(column)
    {
        return column.visible;
    }

    function loadColumns()
    {
        var that = this,
            firstHeadRow = this.element.find("thead > tr").first(),
            sorted = false;

        /*jshint -W018*/
        firstHeadRow.children().each(function ()
        {
            var $this = $(this),
                data = $this.data(),
                column = {
                    id: data.columnId,
                    identifier: that.identifier == null && data.identifier || false,
                    converter: that.options.converters[data.converter || data.type] || that.options.converters["string"],
                    text: $this.text(),
                    align: data.align || "left",
                    headerAlign: data.headerAlign || "left",
                    cssClass: data.cssClass || "",
                    headerCssClass: data.headerCssClass || "",
                    formatter: that.options.formatters[data.formatter] || null,
                    order: (!sorted && (data.order === "asc" || data.order === "desc")) ? data.order : null,
                    searchable: !(data.searchable === false), // default: true
                    sortable: !(data.sortable === false), // default: true
                    visible: !(data.visible === false), // default: true
                    width: data.width || "",
                    enableTooltip: !!data.enableTooltip,
                    tooltipSource: data.tooltipSource,
                };
            that.columns.push(column);
            if (column.order != null)
            {
                that.sort[column.id] = column.order;
            }

            // Prevents multiple identifiers
            if (column.identifier)
            {
                that.identifier = column.id;
                that.converter = column.converter;
            }

            // ensures that only the first order will be applied in case of multi sorting is disabled
            if (!that.options.multiSort && column.order !== null)
            {
                sorted = true;
            }
        });
        /*jshint +W018*/
    }

    /*
    response = {
        current: 1,
        rowCount: 10,
        rows: [{}, {}],
        sort: [{ "columnId": "asc" }],
        total: 101
    }
    */

    function loadData()
    {
        var that = this,
            request = getRequest.call(this),
            url = getUrl.call(this);

        if (this.options.ajax && (url == null || typeof url !== "string" || url.length === 0))
        {
            throw new Error("Url setting must be a none empty string or a function that returns one.");
        }

        this.element._bgBusyAria(true).trigger("load" + namespace);
        showLoading.call(this);

        function containsPhrase(row)
        {
            var column,
                searchPattern = new RegExp(that.searchPhrase, (that.options.caseSensitive) ? "g" : "gi");

            for (var i = 0; i < that.columns.length; i++)
            {
                column = that.columns[i];
                if (column.searchable && column.visible && 
                    column.converter.to(row[column.id]).search(searchPattern) > -1)
                {
                    return true;
                }
            }

            return false;
        }

        function update(rows, total)
        {
            that.currentRows = rows;
            that.total = total;
            that.totalPages = Math.ceil(total / that.rowCount);

            if (!that.options.keepSelection)
            {
                that.selectedRows = [];
            }

            renderRows.call(that, rows);
            renderInfos.call(that);
            renderPagination.call(that);

            that.element._bgBusyAria(false).trigger("loaded" + namespace);
        }

        if (this.options.ajax)
        {
            // aborts the previous ajax request if not already finished or failed
            if (that.xqr)
            {
                that.xqr.abort();
            }

            that.xqr = $.post(url, request, function (response)
            {
                that.xqr = null;

                if (typeof (response) === "string")
                {
                    response = $.parseJSON(response);
                }

                response = that.options.responseHandler(response);

                that.current = response.current;
                update(response.rows, response.total);
            }).fail(function (jqXHR, textStatus, errorThrown)
            {
                that.xqr = null;

                if (textStatus !== "abort")
                {
                    renderNoResultsRow.call(that); // overrides loading mask
                    that.element._bgBusyAria(false).trigger("loaded" + namespace);
                }
            });
        }
        else
        {
            var rows = (this.searchPhrase.length > 0) ? this.rows.where(containsPhrase) : this.rows,
                total = rows.length;
            if (this.rowCount !== -1)
            {
                rows = rows.page(this.current, this.rowCount);
            }

            // todo: improve the following comment
            // setTimeout decouples the initialization so that adding event handlers happens before
            window.setTimeout(function () { update(rows, total); }, 10);
        }
    }

    function loadRows()
    {
        if (!this.options.ajax)
        {
            var that = this,
                rows = this.element.find("tbody > tr");

            rows.each(function ()
            {
                var $this = $(this),
                    cells = $this.children("td"),
                    row = {};

                $.each(that.columns, function (i, column)
                {
                    row[column.id] = column.converter.from(cells.eq(i).text());
                });

                appendRow.call(that, row);
            });

            this.total = this.rows.length;
            this.totalPages = (this.rowCount === -1) ? 1 :
                Math.ceil(this.total / this.rowCount);

            sortRows.call(this);
        }
    }

    function prepareTable()
    {
        var tpl = this.options.templates,
            wrapper = (this.element.parent().hasClass(this.options.css.responsiveTable)) ? 
                this.element.parent() : this.element;

        this.element.addClass(this.options.css.table);

        // checks whether there is an tbody element; otherwise creates one
        if (this.element.children("tbody").length === 0)
        {
            this.element.append(tpl.body);
        }

        if (this.options.navigation & 1)
        {
            this.header = $(tpl.header.resolve(getParams.call(this, { id: this.element._bgId() + "-header" })));
            wrapper.before(this.header);
        }

        if (this.options.navigation & 2)
        {
            this.footer = $(tpl.footer.resolve(getParams.call(this, { id: this.element._bgId() + "-footer" })));
            wrapper.after(this.footer);
        }
    }

    function renderActions()
    {
        if (this.options.navigation !== 0)
        {
            var css = this.options.css,
                selector = getCssSelector(css.actions),
                headerActions = this.header.find(selector),
                footerActions = this.footer.find(selector);

            if ((headerActions.length + footerActions.length) > 0)
            {
                var that = this,
                    tpl = this.options.templates,
                    actions = $(tpl.actions.resolve(getParams.call(this)));

                // Refresh Button
                if (this.options.ajax)
                {
                    var refreshIcon = tpl.icon.resolve(getParams.call(this, { iconCss: css.iconRefresh })),
                        refresh = $(tpl.actionButton.resolve(getParams.call(this,
                        { content: refreshIcon, text: this.options.labels.refresh })))
                            .on("click" + namespace, function (e)
                            {
                                // todo: prevent multiple fast clicks (fast click detection)
                                e.stopPropagation();
                                that.current = 1;
                                loadData.call(that);
                            });
                    actions.append(refresh);
                }

                // Row count selection
                renderRowCountSelection.call(this, actions);

                // Column selection
                renderColumnSelection.call(this, actions);

                replacePlaceHolder.call(this, headerActions, actions, 1);
                replacePlaceHolder.call(this, footerActions, actions, 2);
            }
        }
    }

    function renderColumnSelection(actions)
    {
        if (this.options.columnSelection && this.columns.length > 1)
        {
            var that = this,
                css = this.options.css,
                tpl = this.options.templates,
                icon = tpl.icon.resolve(getParams.call(this, { iconCss: css.iconColumns })),
                dropDown = $(tpl.actionDropDown.resolve(getParams.call(this, { content: icon }))),
                selector = getCssSelector(css.dropDownItem),
                checkboxSelector = getCssSelector(css.dropDownItemCheckbox),
                itemsSelector = getCssSelector(css.dropDownMenuItems);

            $.each(this.columns, function (i, column)
            {
                var item = $(tpl.actionDropDownCheckboxItem.resolve(getParams.call(that,
                    { name: column.id, label: column.text, checked: column.visible })))
                        .on("click" + namespace, selector, function (e)
                        {
                            e.stopPropagation();

                            var $this = $(this),
                                checkbox = $this.find(checkboxSelector);
                            if (!checkbox.prop("disabled"))
                            {
                                column.visible = checkbox.prop("checked");
                                var enable = that.columns.where(isVisible).length > 1;
                                $this.parents(itemsSelector).find(selector + ":has(" + checkboxSelector + ":checked)")
                                    ._bgEnableAria(enable).find(checkboxSelector)._bgEnableField(enable);

                                that.element.find("tbody").empty(); // Fixes an column visualization bug
                                renderTableHeader.call(that);
                                loadData.call(that);
                            }
                        });
                dropDown.find(getCssSelector(css.dropDownMenuItems)).append(item);
            });
            actions.append(dropDown);
        }
    }

    function renderInfos()
    {
        if (this.options.navigation !== 0)
        {
            var selector = getCssSelector(this.options.css.infos),
                headerInfos = this.header.find(selector),
                footerInfos = this.footer.find(selector);

            if ((headerInfos.length + footerInfos.length) > 0)
            {
                var end = (this.current * this.rowCount),
                    infos = $(this.options.templates.infos.resolve(getParams.call(this, {
                        end: (this.total === 0 || end === -1 || end > this.total) ? this.total : end,
                        start: (this.total === 0) ? 0 : (end - this.rowCount + 1),
                        total: this.total
                    })));

                replacePlaceHolder.call(this, headerInfos, infos, 1);
                replacePlaceHolder.call(this, footerInfos, infos, 2);
            }
        }
    }

    function renderNoResultsRow()
    {
        var tbody = this.element.children("tbody").first(),
            tpl = this.options.templates,
            count = this.columns.where(isVisible).length;

        if (this.selection)
        {
            count = count + 1;
        }
        tbody.html(tpl.noResults.resolve(getParams.call(this, { columns: count })));
    }

    function renderPagination()
    {
        if (this.options.navigation !== 0)
        {
            var selector = getCssSelector(this.options.css.pagination),
                headerPagination = this.header.find(selector)._bgShowAria(this.rowCount !== -1),
                footerPagination = this.footer.find(selector)._bgShowAria(this.rowCount !== -1);

            if (this.rowCount !== -1 && (headerPagination.length + footerPagination.length) > 0)
            {
                var tpl = this.options.templates,
                    current = this.current,
                    totalPages = this.totalPages,
                    pagination = $(tpl.pagination.resolve(getParams.call(this))),
                    offsetRight = totalPages - current,
                    offsetLeft = (this.options.padding - current) * -1,
                    startWith = ((offsetRight >= this.options.padding) ?
                        Math.max(offsetLeft, 1) :
                        Math.max((offsetLeft - this.options.padding + offsetRight), 1)),
                    maxCount = this.options.padding * 2 + 1,
                    count = (totalPages >= maxCount) ? maxCount : totalPages;

                renderPaginationItem.call(this, pagination, "first", "<i class='md md-more-horiz'></i>", "first")
                    ._bgEnableAria(current > 1);
                renderPaginationItem.call(this, pagination, "prev", "<i class='md md-chevron-left'></i>", "prev")
                    ._bgEnableAria(current > 1);

                for (var i = 0; i < count; i++)
                {
                    var pos = i + startWith;
                    renderPaginationItem.call(this, pagination, pos, pos, "page-" + pos)
                        ._bgEnableAria()._bgSelectAria(pos === current);
                }

                if (count === 0)
                {
                    renderPaginationItem.call(this, pagination, 1, 1, "page-" + 1)
                        ._bgEnableAria(false)._bgSelectAria();
                }

                renderPaginationItem.call(this, pagination, "next", "<i class='md md-chevron-right'></i>", "next")
                    ._bgEnableAria(totalPages > current);
                renderPaginationItem.call(this, pagination, "last", "<i class='md md-more-horiz'><i>", "last")
                    ._bgEnableAria(totalPages > current);

                replacePlaceHolder.call(this, headerPagination, pagination, 1);
                replacePlaceHolder.call(this, footerPagination, pagination, 2);
            }
        }
    }

    function renderPaginationItem(list, uri, text, markerCss)
    {
        var that = this,
            tpl = this.options.templates,
            css = this.options.css,
            values = getParams.call(this, { css: markerCss, text: text, uri: "#" + uri }),
            item = $(tpl.paginationItem.resolve(values))
                .on("click" + namespace, getCssSelector(css.paginationButton), function (e)
                {
                    e.stopPropagation();

                    var $this = $(this),
                        parent = $this.parent();
                    if (!parent.hasClass("active") && !parent.hasClass("disabled"))
                    {
                        var commandList = {
                            first: 1,
                            prev: that.current - 1,
                            next: that.current + 1,
                            last: that.totalPages
                        };
                        var command = $this.attr("href").substr(1);
                        that.current = commandList[command] || +command; // + converts string to int
                        loadData.call(that);
                    }
                    $this.trigger("blur");
                });

        list.append(item);
        return item;
    }

    function renderRowCountSelection(actions)
    {
        var that = this,
            rowCountList = this.options.rowCount;

        function getText(value)
        {
            return (value === -1) ? that.options.labels.all : value;
        }

        if ($.isArray(rowCountList))
        {
            var css = this.options.css,
                tpl = this.options.templates,
                dropDown = $(tpl.actionDropDown.resolve(getParams.call(this, { content: this.rowCount }))),
                menuSelector = getCssSelector(css.dropDownMenu),
                menuTextSelector = getCssSelector(css.dropDownMenuText),
                menuItemsSelector = getCssSelector(css.dropDownMenuItems),
                menuItemSelector = getCssSelector(css.dropDownItemButton);

            $.each(rowCountList, function (index, value)
            {
                var item = $(tpl.actionDropDownItem.resolve(getParams.call(that,
                    { text: getText(value), uri: "#" + value })))
                        ._bgSelectAria(value === that.rowCount)
                        .on("click" + namespace, menuItemSelector, function (e)
                        {
                            e.preventDefault();

                            var $this = $(this),
                                newRowCount = +$this.attr("href").substr(1);
                            if (newRowCount !== that.rowCount)
                            {
                                // todo: sophisticated solution needed for calculating which page is selected
                                that.current = 1; // that.rowCount === -1 ---> All
                                that.rowCount = newRowCount;
                                $this.parents(menuItemsSelector).children().each(function ()
                                {
                                    var $item = $(this),
                                        currentRowCount = +$item.find(menuItemSelector).attr("href").substr(1);
                                    $item._bgSelectAria(currentRowCount === newRowCount);
                                });
                                $this.parents(menuSelector).find(menuTextSelector).text(getText(newRowCount));
                                loadData.call(that);
                            }
                        });
                dropDown.find(menuItemsSelector).append(item);
            });
            actions.append(dropDown);
        }
    }

    function renderRows(rows)
    {
        if (rows.length > 0)
        {
            var that = this,
                css = this.options.css,
                tpl = this.options.templates,
                tbody = this.element.children("tbody").first(),
                allRowsSelected = true,
                html = "",
                cells = "",
                rowAttr = "",
                rowCss = "";

            $.each(rows, function (index, row)
            {
                cells = "";
                rowAttr = " data-row-id=\"" + ((that.identifier == null) ? index : row[that.identifier]) + "\"";
                rowCss = "";

                if (that.selection)
                {
                    var selected = ($.inArray(row[that.identifier], that.selectedRows) !== -1),
                        selectBox = tpl.select.resolve(getParams.call(that, 
                            { type: "checkbox", value: row[that.identifier], checked: selected }));
                    cells += tpl.cell.resolve(getParams.call(that, { content: selectBox, css: css.selectCell }));
                    allRowsSelected = (allRowsSelected && selected);
                    if (selected)
                    {
                        rowCss += css.selected;
                        rowAttr += " aria-selected=\"true\"";
                    }
                }

                $.each(that.columns, function (j, column)
                {
                    if (column.visible)
                    {
                        var value = ($.isFunction(column.formatter)) ? 
                                column.formatter.call(that, column, row) : 
                                    column.converter.to(row[column.id]),
                            cssClass = (column.cssClass.length > 0) ? " " + column.cssClass : "";
                        var toolTip = "";
                        if (column.enableTooltip) {
                            toolTip = value;
                            if (column.tooltipSource) {
                                toolTip = column.converter.to(row[column.tooltipSource]);
                            }
                        }
                        cells += tpl.cell.resolve(getParams.call(that, {
                            content: (value == null || value === "") ? "&nbsp;" : value,
                            toolTip: toolTip,
                            css: ((column.align === "right") ? css.right : (column.align === "center") ? 
                                css.center : css.left) + cssClass }));
                    }
                });

                if (rowCss.length > 0)
                {
                    rowAttr += " class=\"" + rowCss + "\"";
                }
                html += tpl.row.resolve(getParams.call(that, { attr: rowAttr, cells: cells }));
            });

            // sets or clears multi selectbox state
            that.element.find("thead " + getCssSelector(that.options.css.selectBox))
                .prop("checked", allRowsSelected);

            tbody.html(html);

            registerRowEvents.call(this, tbody);
        }
        else
        {
            renderNoResultsRow.call(this);
        }
    }

    function registerRowEvents(tbody)
    {
        var that = this,
            selectBoxSelector = getCssSelector(this.options.css.selectBox);

        if (this.selection)
        {
            tbody.off("click" + namespace, selectBoxSelector)
                .on("click" + namespace, selectBoxSelector, function(e)
                {
                    e.stopPropagation();

                    var $this = $(this),
                        id = that.converter.from($this.val());

                    if ($this.prop("checked"))
                    {
                        that.select([id]);
                    }
                    else
                    {
                        that.deselect([id]);
                    }
                });
        }

        tbody.off("click" + namespace, "> tr")
            .on("click" + namespace, "> tr", function(e)
            {
                e.stopPropagation();

                var $this = $(this),
                    id = (that.identifier == null) ? $this.data("row-id") : 
                        that.converter.from($this.data("row-id") + ""),
                    row = (that.identifier == null) ? that.currentRows[id] : 
                        that.currentRows.first(function (item) { return item[that.identifier] === id; });

                if (that.selection && that.options.rowSelect)
                {
                    if ($this.hasClass(that.options.css.selected))
                    {
                        that.deselect([id]);
                    }
                    else
                    {
                        that.select([id]);
                    }
                }

                that.element.trigger("click" + namespace, [that.columns, row, e]);
            });
    }

    function renderSearchField()
    {
        if (this.options.navigation !== 0)
        {
            var css = this.options.css,
                selector = getCssSelector(css.search),
                headerSearch = this.header.find(selector),
                footerSearch = this.footer.find(selector);

            if ((headerSearch.length + footerSearch.length) > 0)
            {
                var that = this,
                    tpl = this.options.templates,
                    timer = null, // fast keyup detection
                    currentValue = "",
                    searchFieldSelector = getCssSelector(css.searchField),
                    search = $(tpl.search.resolve(getParams.call(this))),
                    searchField = (search.is(searchFieldSelector)) ? search :
                        search.find(searchFieldSelector);

                searchField.on("keyup" + namespace, function (e)
                {
                    e.stopPropagation();
                    var newValue = $(this).val();
                    if (currentValue !== newValue)
                    {
                        currentValue = newValue;
                        window.clearTimeout(timer);
                        timer = window.setTimeout(function ()
                        {
                            that.search(newValue);
                        }, 250);
                    }
                });

                replacePlaceHolder.call(this, headerSearch, search, 1);
                replacePlaceHolder.call(this, footerSearch, search, 2);
            }
        }
    }

    function renderTableHeader()
    {
        var that = this,
            headerRow = this.element.find("thead > tr"),
            css = this.options.css,
            tpl = this.options.templates,
            html = "",
            sorting = this.options.sorting;

        if (this.selection)
        {
            var selectBox = (this.options.multiSelect) ? 
                tpl.select.resolve(getParams.call(that, { type: "checkbox", value: "all" })) : "";
            html += tpl.rawHeaderCell.resolve(getParams.call(that, { content: selectBox, 
                css: css.selectCell }));
        }

        $.each(this.columns, function (index, column)
        {
            if (column.visible)
            {
                var sortOrder = that.sort[column.id],
                    iconCss = ((sorting && sortOrder && sortOrder === "asc") ? css.iconUp :
                        (sorting && sortOrder && sortOrder === "desc") ? css.iconDown : ""),
                    icon = tpl.icon.resolve(getParams.call(that, { iconCss: iconCss })),
                    align = column.headerAlign,
                    cssClass = (column.headerCssClass.length > 0) ? " " + column.headerCssClass : "";
                var style = "";
                if (column.width) {
                    style += "width:" + column.width + ";"
                }
                if (style) {
                    style = "style=\"" + style + "\"";
                }
                html += tpl.headerCell.resolve(getParams.call(that, {
                    column: column, icon: icon, sortable: sorting && column.sortable && css.sortable || "",
                    css: ((align === "right") ? css.right : (align === "center") ? 
                        css.center : css.left) + cssClass, style: style }));
            }
        });

        headerRow.html(html);

        // todo: create a own function for that piece of code
        if (sorting)
        {
            var sortingSelector = getCssSelector(css.sortable),
                iconSelector = getCssSelector(css.icon);
            headerRow.off("click" + namespace, sortingSelector)
                .on("click" + namespace, sortingSelector, function (e)
                {
                    e.preventDefault();
                    var $this = $(this),
                        columnId = $this.data("column-id") || $this.parents("th").first().data("column-id"),
                        sortOrder = that.sort[columnId],
                        icon = $this.find(iconSelector);

                    if (!that.options.multiSort)
                    {
                        $this.parents("tr").first().find(iconSelector).removeClass(css.iconDown + " " + css.iconUp);
                        that.sort = {};
                    }

                    if (sortOrder && sortOrder === "asc")
                    {
                        that.sort[columnId] = "desc";
                        icon.removeClass(css.iconUp).addClass(css.iconDown);
                    }
                    else if (sortOrder && sortOrder === "desc")
                    {
                        if (that.options.multiSort)
                        {
                            var newSort = {};
                            for (var key in that.sort)
                            {
                                if (key !== columnId)
                                {
                                    newSort[key] = that.sort[key];
                                }
                            }
                            that.sort = newSort;
                            icon.removeClass(css.iconDown);
                        }
                        else
                        {
                            that.sort[columnId] = "asc";
                            icon.removeClass(css.iconDown).addClass(css.iconUp);
                        }
                    }
                    else
                    {
                        that.sort[columnId] = "asc";
                        icon.addClass(css.iconUp);
                    }

                    sortRows.call(that);
                    loadData.call(that);
                });
        }

        // todo: create a own function for that piece of code
        if (this.selection && this.options.multiSelect)
        {
            var selectBoxSelector = getCssSelector(css.selectBox);
            headerRow.off("click" + namespace, selectBoxSelector)
                .on("click" + namespace, selectBoxSelector, function(e)
                {
                    e.stopPropagation();

                    if ($(this).prop("checked"))
                    {
                        that.select();
                    }
                    else
                    {
                        that.deselect();
                    }
                });
        }
    }

    function replacePlaceHolder(placeholder, element, flag)
    {
        if (this.options.navigation & flag)
        {
            placeholder.each(function (index, item)
            {
                // todo: check how append is implemented. Perhaps cloning here is superfluous.
                $(item).before(element.clone(true)).remove();
            });
        }
    }

    function showLoading()
    {
        var tpl = this.options.templates,
            thead = this.element.children("thead").first(),
            tbody = this.element.children("tbody").first(),
            firstCell = tbody.find("tr > td").first(),
            padding = (this.element.height() - thead.height()) - (firstCell.height() + 20),
            count = this.columns.where(isVisible).length;

        if (this.selection)
        {
            count = count + 1;
        }
        tbody.html(tpl.loading.resolve(getParams.call(this, { columns: count })));
        if (this.rowCount !== -1 && padding > 0)
        {
            tbody.find("tr > td").css("padding", "20px 0 " + padding + "px");
        }
    }

    function sortRows()
    {
        var sortArray = [];

        function sort(x, y, current)
        {
            current = current || 0;
            var next = current + 1,
                item = sortArray[current];

            function sortOrder(value)
            {
                return (item.order === "asc") ? value : value * -1;
            }

            return (x[item.id] > y[item.id]) ? sortOrder(1) :
                (x[item.id] < y[item.id]) ? sortOrder(-1) :
                    (sortArray.length > next) ? sort(x, y, next) : 0;
        }

        if (!this.options.ajax)
        {
            var that = this;

            for (var key in this.sort)
            {
                if (this.options.multiSort || sortArray.length === 0)
                {
                    sortArray.push({
                        id: key,
                        order: this.sort[key]
                    });
                }
            }

            if (sortArray.length > 0)
            {
                this.rows.sort(sort);
            }
        }
    }

    // GRID PUBLIC CLASS DEFINITION
    // ====================

    /**
     * Represents the jQuery Bootgrid plugin.
     *
     * @class Grid
     * @constructor
     * @param element {Object} The corresponding DOM element.
     * @param options {Object} The options to override default settings.
     * @chainable
     **/
    var Grid = function(element, options)
    {
        this.element = $(element);
        this.origin = this.element.clone();
        this.options = $.extend(true, {}, Grid.defaults, this.element.data(), options);
        // overrides rowCount explicitly because deep copy ($.extend) leads to strange behaviour
        var rowCount = this.options.rowCount = this.element.data().rowCount || options.rowCount || this.options.rowCount;
        this.columns = [];
        this.current = 1;
        this.currentRows = [];
        this.identifier = null; // The first column ID that is marked as identifier
        this.selection = false;
        this.converter = null; // The converter for the column that is marked as identifier
        this.rowCount = ($.isArray(rowCount)) ? rowCount[0] : rowCount;
        this.rows = [];
        this.searchPhrase = "";
        this.selectedRows = [];
        this.sort = {};
        this.total = 0;
        this.totalPages = 0;
        this.cachedParams = {
            lbl: this.options.labels,
            css: this.options.css,
            ctx: {}
        };
        this.header = null;
        this.footer = null;
        this.xqr = null;

        // todo: implement cache
    };

    /**
     * An object that represents the default settings.
     * There are two ways to override the sub-properties.
     * Either by doing it generally (global) or on initialization.
     *
     * @static
     * @class defaults
     * @for Grid
     * @example
     *   // Global approach
     *   $.bootgrid.defaults.selection = true;
     * @example
     *   // Initialization approach
     *   $("#bootgrid").bootgrid({ selection = true });
     **/
    Grid.defaults = {
        navigation: 3, // it's a flag: 0 = none, 1 = top, 2 = bottom, 3 = both (top and bottom)
        padding: 2, // page padding (pagination)
        columnSelection: true,
        rowCount: [10, 25, 50, -1], // rows per page int or array of int (-1 represents "All")

        /**
         * Enables row selection (to enable multi selection see also `multiSelect`). Default value is `false`.
         *
         * @property selection
         * @type Boolean
         * @default false
         * @for defaults
         * @since 1.0.0
         **/
        selection: false,

        /**
         * Enables multi selection (`selection` must be set to `true` as well). Default value is `false`.
         *
         * @property multiSelect
         * @type Boolean
         * @default false
         * @for defaults
         * @since 1.0.0
         **/
        multiSelect: false,

        /**
         * Enables entire row click selection (`selection` must be set to `true` as well). Default value is `false`.
         *
         * @property rowSelect
         * @type Boolean
         * @default false
         * @for defaults
         * @since 1.1.0
         **/
        rowSelect: false,

        /**
         * Defines whether the row selection is saved internally on filtering, paging and sorting 
         * (even if the selected rows are not visible).
         *
         * @property keepSelection
         * @type Boolean
         * @default false
         * @for defaults
         * @since 1.1.0
         **/
        keepSelection: false,

        highlightRows: false, // highlights new rows (find the page of the first new row)
        sorting: true,
        multiSort: false,
        ajax: false, // todo: find a better name for this property to differentiate between client-side and server-side data

        /**
         * Enriches the request object with additional properties. Either a `PlainObject` or a `Function` 
         * that returns a `PlainObject` can be passed. Default value is `{}`.
         *
         * @property post
         * @type Object|Function
         * @default function (request) { return request; }
         * @for defaults
         * @deprecated Use instead `requestHandler`
         **/
        post: {}, // or use function () { return {}; } (reserved properties are "current", "rowCount", "sort" and "searchPhrase")

        /**
         * Sets the data URL to a data service (e.g. a REST service). Either a `String` or a `Function` 
         * that returns a `String` can be passed. Default value is `""`.
         *
         * @property url
         * @type String|Function
         * @default ""
         * @for defaults
         **/
        url: "", // or use function () { return ""; }

        /**
         * Defines whether the search is case sensitive or insensitive.
         *
         * @property caseSensitive
         * @type Boolean
         * @default true
         * @for defaults
         * @since 1.1.0
         **/
        caseSensitive: true,

        // note: The following properties should not be used via data-api attributes

        /**
         * Transforms the JSON request object in what ever is needed on the server-side implementation.
         *
         * @property requestHandler
         * @type Function
         * @default function (request) { return request; }
         * @for defaults
         * @since 1.1.0
         **/
        requestHandler: function (request) { return request; },

        /**
         * Transforms the response object into the expected JSON response object.
         *
         * @property responseHandler
         * @type Function
         * @default function (response) { return response; }
         * @for defaults
         * @since 1.1.0
         **/
        responseHandler: function (response) { return response; },

        /**
         * A list of converters.
         *
         * @property converters
         * @type Object
         * @for defaults
         * @since 1.0.0
         **/
        converters: {
            numeric: {
                from: function (value) { return +value; }, // converts from string to numeric
                to: function (value) { return value + ""; } // converts from numeric to string
            },
            string: {
                // default converter
                from: function (value) { return value; },
                to: function (value) { return value; }
            }
        },

        /**
         * Contains all css classes.
         *
         * @property css
         * @type Object
         * @for defaults
         **/
        css: {
            actions: "actions btn-group", // must be a unique class name or constellation of class names within the header and footer
            center: "text-center",
            columnHeaderAnchor: "column-header-anchor", // must be a unique class name or constellation of class names within the column header cell
            columnHeaderText: "text",
            dropDownItem: "dropdown-item", // must be a unique class name or constellation of class names within the actionDropDown,
            dropDownItemButton: "dropdown-item-button", // must be a unique class name or constellation of class names within the actionDropDown
            dropDownItemCheckbox: "dropdown-item-checkbox", // must be a unique class name or constellation of class names within the actionDropDown
            dropDownMenu: "dropdown btn-group", // must be a unique class name or constellation of class names within the actionDropDown
            dropDownMenuItems: "dropdown-menu pull-right", // must be a unique class name or constellation of class names within the actionDropDown
            dropDownMenuText: "dropdown-text", // must be a unique class name or constellation of class names within the actionDropDown
            footer: "bootgrid-footer container-fluid",
            header: "bootgrid-header container-fluid",
            icon: "icon glyphicon",
            iconColumns: "glyphicon-th-list",
            iconDown: "glyphicon-chevron-down",
            iconRefresh: "glyphicon-refresh",
            iconUp: "glyphicon-chevron-up",
            infos: "infos", // must be a unique class name or constellation of class names within the header and footer,
            left: "text-left",
            pagination: "pagination", // must be a unique class name or constellation of class names within the header and footer
            paginationButton: "button", // must be a unique class name or constellation of class names within the pagination

            /**
             * CSS class to select the parent div which activates responsive mode.
             *
             * @property responsiveTable
             * @type String
             * @default "table-responsive"
             * @for css
             * @since 1.1.0
             **/
            responsiveTable: "table-responsive",

            right: "text-right",
            search: "search form-group", // must be a unique class name or constellation of class names within the header and footer
            searchField: "search-field form-control",
            selectBox: "select-box", // must be a unique class name or constellation of class names within the entire table
            selectCell: "select-cell", // must be a unique class name or constellation of class names within the entire table

            /**
             * CSS class to highlight selected rows.
             *
             * @property selected
             * @type String
             * @default "active"
             * @for css
             * @since 1.1.0
             **/
            selected: "active",

            sortable: "sortable",
            table: "bootgrid-table table"
        },

        /**
         * A dictionary of formatters.
         *
         * @property formatters
         * @type Object
         * @for defaults
         * @since 1.0.0
         **/
        formatters: {},

        /**
         * Contains all labels.
         *
         * @property labels
         * @type Object
         * @for defaults
         **/
        labels: {
            all: "All",
            infos: "Showing {{ctx.start}} to {{ctx.end}} of {{ctx.total}} entries",
            loading: "Loading...",
            noResults: "No results found!",
            refresh: "Refresh",
            search: "Search"
        },

        /**
         * Contains all templates.
         *
         * @property templates
         * @type Object
         * @for defaults
         **/
        templates: {
            actionButton: "<button class=\"btn btn-default\" type=\"button\" title=\"{{ctx.text}}\">{{ctx.content}}</button>",
            actionDropDown: "<div class=\"{{css.dropDownMenu}}\"><button class=\"btn btn-default dropdown-toggle\" type=\"button\" data-toggle=\"dropdown\"><span class=\"{{css.dropDownMenuText}}\">{{ctx.content}}</span> <span class=\"caret\"></span></button><ul class=\"{{css.dropDownMenuItems}}\" role=\"menu\"></ul></div>",
            actionDropDownItem: "<li><a href=\"{{ctx.uri}}\" class=\"{{css.dropDownItem}} {{css.dropDownItemButton}}\">{{ctx.text}}</a></li>",
            actionDropDownCheckboxItem: "<li><div class=\"checkbox\"><label class=\"{{css.dropDownItem}}\"><input name=\"{{ctx.name}}\" type=\"checkbox\" value=\"1\" class=\"{{css.dropDownItemCheckbox}}\" {{ctx.checked}} /><i class=\"input-helper\"></i> {{ctx.label}}</label></div></li>",
            actions: "<div class=\"{{css.actions}}\"></div>",
            body: "<tbody></tbody>",
            cell: "<td class=\"{{ctx.css}}\" data-toggle=\"tooltip\" title=\"{{ctx.toolTip}}\">{{ctx.content}}</td>",
            footer: "<div id=\"{{ctx.id}}\" class=\"{{css.footer}}\"><div class=\"row\"><div class=\"col-sm-8\"><p class=\"{{css.pagination}}\"></p></div><div class=\"col-sm-4 infoBar\"><p class=\"{{css.infos}}\"></p></div></div></div>",
            header: "<div id=\"{{ctx.id}}\" class=\"{{css.header}}\"><div class=\"row\"><div class=\"col-sm-12 actionBar\"><p class=\"{{css.search}}\"></p><p class=\"{{css.actions}}\"></p></div></div></div>",
            headerCell: "<th data-column-id=\"{{ctx.column.id}}\" class=\"{{ctx.css}}\" {{ctx.style}}><a href=\"javascript:void(0);\" class=\"{{css.columnHeaderAnchor}} {{ctx.sortable}}\"><span class=\"{{css.columnHeaderText}}\">{{ctx.column.text}}</span>{{ctx.icon}}</a></th>",
            icon: "<span class=\"{{css.icon}} {{ctx.iconCss}}\"></span>",
            infos: "<div class=\"{{css.infos}}\">{{lbl.infos}}</div>",
            loading: "<tr><td colspan=\"{{ctx.columns}}\" class=\"loading\">{{lbl.loading}}</td></tr>",
            noResults: "<tr><td colspan=\"{{ctx.columns}}\" class=\"no-results\">{{lbl.noResults}}</td></tr>",
            pagination: "<ul class=\"{{css.pagination}}\"></ul>",
            paginationItem: "<li class=\"{{ctx.css}}\"><a href=\"{{ctx.uri}}\" class=\"{{css.paginationButton}}\">{{ctx.text}}</a></li>",
            rawHeaderCell: "<th class=\"{{ctx.css}}\">{{ctx.content}}</th>", // Used for the multi select box
            row: "<tr{{ctx.attr}}>{{ctx.cells}}</tr>",
            search: "<div class=\"{{css.search}}\"><div class=\"input-group\"><span class=\"{{css.icon}} input-group-addon glyphicon-search\"></span> <input type=\"text\" class=\"{{css.searchField}}\" placeholder=\"{{lbl.search}}\" /></div></div>",
            select: "<div class=\"checkbox\"><label><input name=\"select\" type=\"{{ctx.type}}\" class=\"{{css.selectBox}}\" value=\"{{ctx.value}}\" {{ctx.checked}} /><i class=\"input-helper\"</label></div>"
        }
    };

    /**
     * Appends rows.
     *
     * @method append
     * @param rows {Array} An array of rows to append
     * @chainable
     **/
    Grid.prototype.append = function(rows)
    {
        if (this.options.ajax)
        {
            // todo: implement ajax DELETE
        }
        else
        {
            var appendedRows = [];
            for (var i = 0; i < rows.length; i++)
            {
                if (appendRow.call(this, rows[i]))
                {
                    appendedRows.push(rows[i]);
                }
            }
            sortRows.call(this);
            highlightAppendedRows.call(this, appendedRows);
            loadData.call(this);
            this.element.trigger("appended" + namespace, [appendedRows]);
        }

        return this;
    };

    /**
     * Removes all rows.
     *
     * @method clear
     * @chainable
     **/
    Grid.prototype.clear = function()
    {
        if (this.options.ajax)
        {
            // todo: implement ajax POST
        }
        else
        {
            var removedRows = $.extend([], this.rows);
            this.rows = [];
            this.current = 1;
            this.total = 0;
            loadData.call(this);
            this.element.trigger("cleared" + namespace, [removedRows]);
        }

        return this;
    };

    /**
     * Removes the control functionality completely and transforms the current state to the initial HTML structure.
     *
     * @method destroy
     * @chainable
     **/
    Grid.prototype.destroy = function()
    {
        // todo: this method has to be optimized (the complete initial state must be restored)
        $(window).off(namespace);
        if (this.options.navigation & 1)
        {
            this.header.remove();
        }
        if (this.options.navigation & 2)
        {
            this.footer.remove();
        }
        this.element.before(this.origin).remove();

        return this;
    };

    /**
     * Resets the state and reloads rows.
     *
     * @method reload
     * @chainable
     **/
    Grid.prototype.reload = function()
    {
        this.current = 1; // reset
        loadData.call(this);

        return this;
    };

    /**
     * Removes rows by ids. Removes selected rows if no ids are provided.
     *
     * @method remove
     * @param [rowsIds] {Array} An array of rows ids to remove
     * @chainable
     **/
    Grid.prototype.remove = function(rowIds)
    {
        if (this.identifier != null)
        {
            var that = this;

            if (this.options.ajax)
            {
                // todo: implement ajax DELETE
            }
            else
            {
                rowIds = rowIds || this.selectedRows;
                var id,
                    removedRows = [];

                for (var i = 0; i < rowIds.length; i++)
                {
                    id = rowIds[i];

                    for (var j = 0; j < this.rows.length; j++)
                    {
                        if (this.rows[j][this.identifier] === id)
                        {
                            removedRows.push(this.rows[j]);
                            this.rows.splice(j, 1);
                            break;
                        }
                    }
                }

                this.current = 1; // reset
                loadData.call(this);
                this.element.trigger("removed" + namespace, [removedRows]);
            }
        }

        return this;
    };

    /**
     * Searches in all rows for a specific phrase (but only in visible cells).
     *
     * @method search
     * @param phrase {String} The phrase to search for
     * @chainable
     **/
    Grid.prototype.search = function(phrase)
    {
        if (this.searchPhrase !== phrase)
        {
            this.current = 1;
            this.searchPhrase = phrase;
            loadData.call(this);
        }

        return this;
    };

    /**
     * Selects rows by ids. Selects all visible rows if no ids are provided.
     * In server-side scenarios only visible rows are selectable.
     *
     * @method select
     * @param [rowsIds] {Array} An array of rows ids to select
     * @chainable
     **/
    Grid.prototype.select = function(rowIds)
    {
        if (this.selection)
        {
            rowIds = rowIds || this.currentRows.propValues(this.identifier);

            var id, i, 
                selectedRows = [];

            while (rowIds.length > 0 && !(!this.options.multiSelect && selectedRows.length === 1))
            {
                id = rowIds.pop();
                if ($.inArray(id, this.selectedRows) === -1)
                {
                    for (i = 0; i < this.currentRows.length; i++)
                    {
                        if (this.currentRows[i][this.identifier] === id)
                        {
                            selectedRows.push(this.currentRows[i]);
                            this.selectedRows.push(id);
                            break;
                        }
                    }
                }
            }

            if (selectedRows.length > 0)
            {
                var selectBoxSelector = getCssSelector(this.options.css.selectBox),
                    selectMultiSelectBox = this.selectedRows.length >= this.currentRows.length;

                i = 0;
                while (!this.options.keepSelection && selectMultiSelectBox && i < this.currentRows.length)
                {
                    selectMultiSelectBox = ($.inArray(this.currentRows[i++][this.identifier], this.selectedRows) !== -1);
                }
                this.element.find("thead " + selectBoxSelector).prop("checked", selectMultiSelectBox);

                if (!this.options.multiSelect)
                {
                    this.element.find("tbody > tr " + selectBoxSelector + ":checked")
                        .trigger("click" + namespace);
                }

                for (i = 0; i < this.selectedRows.length; i++)
                {
                    this.element.find("tbody > tr[data-row-id=\"" + this.selectedRows[i] + "\"]")
                        .addClass(this.options.css.selected)._bgAria("selected", "true")
                        .find(selectBoxSelector).prop("checked", true);
                }

                this.element.trigger("selected" + namespace, [selectedRows]);
            }
        }

        return this;
    };

    /**
     * Deselects rows by ids. Deselects all visible rows if no ids are provided.
     * In server-side scenarios only visible rows are deselectable.
     *
     * @method deselect
     * @param [rowsIds] {Array} An array of rows ids to deselect
     * @chainable
     **/
    Grid.prototype.deselect = function(rowIds)
    {
        if (this.selection)
        {
            rowIds = rowIds || this.currentRows.propValues(this.identifier);

            var id, i, pos,
                deselectedRows = [];

            while (rowIds.length > 0)
            {
                id = rowIds.pop();
                pos = $.inArray(id, this.selectedRows);
                if (pos !== -1)
                {
                    for (i = 0; i < this.currentRows.length; i++)
                    {
                        if (this.currentRows[i][this.identifier] === id)
                        {
                            deselectedRows.push(this.currentRows[i]);
                            this.selectedRows.splice(pos, 1);
                            break;
                        }
                    }
                }
            }

            if (deselectedRows.length > 0)
            {
                var selectBoxSelector = getCssSelector(this.options.css.selectBox);

                this.element.find("thead " + selectBoxSelector).prop("checked", false);
                for (i = 0; i < deselectedRows.length; i++)
                {
                    this.element.find("tbody > tr[data-row-id=\"" + deselectedRows[i][this.identifier] + "\"]")
                        .removeClass(this.options.css.selected)._bgAria("selected", "false")
                        .find(selectBoxSelector).prop("checked", false);
                }
                
                this.element.trigger("deselected" + namespace, [deselectedRows]);
            }
        }

        return this;
    };


    /**
     * Sorts rows.
     *
     * @method sort
     * @param dictionary {Object} A dictionary which contains the sort information
     * @chainable
     **/
    Grid.prototype.sort = function(dictionary)
    {
        var values = (dictionary) ? $.extend({}, dictionary) : {};
        if (values === this.sort)
        {
            return this;
        }

        this.sort = values;

        renderTableHeader.call(this);
        sortRows.call(this);
        loadData.call(this);

        return this;
    };

    // GRID COMMON TYPE EXTENSIONS
    // ============

    $.fn.extend({
        _bgAria: function (name, value)
        {
            return this.attr("aria-" + name, value);
        },

        _bgBusyAria: function(busy)
        {
            return (busy == null || busy) ? 
                this._bgAria("busy", "true") : 
                this._bgAria("busy", "false");
        },

        _bgRemoveAria: function (name)
        {
            return this.removeAttr("aria-" + name);
        },

        _bgEnableAria: function (enable)
        {
            return (enable == null || enable) ? 
                this.removeClass("disabled")._bgAria("disabled", "false") : 
                this.addClass("disabled")._bgAria("disabled", "true");
        },

        _bgEnableField: function (enable)
        {
            return (enable == null || enable) ? 
                this.removeAttr("disabled") : 
                this.attr("disabled", "disable");
        },

        _bgShowAria: function (show)
        {
            return (show == null || show) ? 
                this.show()._bgAria("hidden", "false") :
                this.hide()._bgAria("hidden", "true");
        },

        _bgSelectAria: function (select)
        {
            return (select == null || select) ? 
                this.addClass("active")._bgAria("selected", "true") : 
                this.removeClass("active")._bgAria("selected", "false");
        },

        _bgId: function (id)
        {
            return (id) ? this.attr("id", id) : this.attr("id");
        }
    });

    if (!String.prototype.resolve)
    {
        var formatter = {
            "checked": function(value)
            {
                if (typeof value === "boolean")
                {
                    return (value) ? "checked=\"checked\"" : "";
                }
                return value;
            }
        };

        String.prototype.resolve = function (substitutes, prefixes)
        {
            var result = this;
            $.each(substitutes, function (key, value)
            {
                if (value != null && typeof value !== "function")
                {
                    if (typeof value === "object")
                    {
                        var keys = (prefixes) ? $.extend([], prefixes) : [];
                        keys.push(key);
                        result = result.resolve(value, keys) + "";
                    }
                    else
                    {
                        if (formatter && formatter[key] && typeof formatter[key] === "function")
                        {
                            value = formatter[key](value);
                        }
                        key = (prefixes) ? prefixes.join(".") + "." + key : key;
                        var pattern = new RegExp("\\{\\{" + key + "\\}\\}", "gm");
                        result = result.replace(pattern, (value.replace) ? value.replace(/\$/gi, "&#36;") : value);
                    }
                }
            });
            return result;
        };
    }

    if (!Array.prototype.first)
    {
        Array.prototype.first = function (condition)
        {
            for (var i = 0; i < this.length; i++)
            {
                var item = this[i];
                if (condition(item))
                {
                    return item;
                }
            }
            return null;
        };
    }

    if (!Array.prototype.contains)
    {
        Array.prototype.contains = function (condition)
        {
            for (var i = 0; i < this.length; i++)
            {
                var item = this[i];
                if (condition(item))
                {
                    return true;
                }
            }
            return false;
        };
    }

    if (!Array.prototype.page)
    {
        Array.prototype.page = function (page, size)
        {
            var skip = (page - 1) * size,
                end = skip + size;
            return (this.length > skip) ? 
                (this.length > end) ? this.slice(skip, end) : 
                    this.slice(skip) : [];
        };
    }

    if (!Array.prototype.where)
    {
        Array.prototype.where = function (condition)
        {
            var result = [];
            for (var i = 0; i < this.length; i++)
            {
                var item = this[i];
                if (condition(item))
                {
                    result.push(item);
                }
            }
            return result;
        };
    }

    if (!Array.prototype.propValues)
    {
        Array.prototype.propValues = function (propName)
        {
            var result = [];
            for (var i = 0; i < this.length; i++)
            {
                result.push(this[i][propName]);
            }
            return result;
        };
    }

    // GRID PLUGIN DEFINITION
    // =====================

    var old = $.fn.bootgrid;

    $.fn.bootgrid = function (option)
    {
        var args = Array.prototype.slice.call(arguments, 1);
        return this.each(function ()
        {
            var $this = $(this),
                instance = $this.data(namespace),
                options = typeof option === "object" && option;

            if (!instance && option === "destroy")
            {
                return;
            }
            if (!instance)
            {
                $this.data(namespace, (instance = new Grid(this, options)));
                init.call(instance);
            }
            if (typeof option === "string")
            {
                return instance[option].apply(instance, args);
            }
        });
    };

    $.fn.bootgrid.Constructor = Grid;

    // GRID NO CONFLICT
    // ===============

    $.fn.bootgrid.noConflict = function ()
    {
        $.fn.bootgrid = old;
        return this;
    };

    // GRID DATA-API
    // ============

$("[data-toggle=\"bootgrid\"]").bootgrid();
})(jQuery, window);