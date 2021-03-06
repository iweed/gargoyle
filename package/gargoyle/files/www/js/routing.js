var rtgS=new Object(); //part of i18n

var toggleReload = false;

function saveChanges()
{
	setControlsEnabled(false, true, UI.waitText);

	var removeCommands = [];
	var oldSections = uciOriginal.getAllSectionsOfType("network", "route");
	while(oldSections.length > 0)
	{
		var delSection = oldSections.pop();
		uciOriginal.removeSection("network", delSection);
		removeCommands.push("uci del network." + delSection);
	}
	var oldSections = uciOriginal.getAllSectionsOfType("network", "route6");
	while(oldSections.length > 0)
	{
		var delSection = oldSections.pop();
		uciOriginal.removeSection("network", delSection);
		removeCommands.push("uci del network." + delSection);
	}
	removeCommands.push("uci commit");

	var uci = uciOriginal.clone();
	var staticRouteTable = document.getElementById('static_route_table_container').firstChild;
	var staticRouteData = getTableDataArray(staticRouteTable, true, false);
	var routeIndex = 0;
	for(routeIndex=0; routeIndex < staticRouteData.length; routeIndex++)
	{
		var row = staticRouteData[routeIndex];
		var destParts = parseDest(row[0]); //converts "default" properly
		var dest    = destParts[0];
		var netmask = destParts[1];
		var iface   = row[1];
		var gateway = (row[2] == "*") ? "0.0.0.0" : row[2];
		var routeId = "route" + (routeIndex+1);
		uci.set("network", routeId, "", "route");
		uci.set("network", routeId, "target", dest);
		uci.set("network", routeId, "interface", iface);
		uci.set("network", routeId, "gateway", gateway);
		if(netmask != ""){ uci.set("network", routeId, "netmask", netmask); }
	}

	var routeIdxOffset = routeIndex;
	var staticRouteTable = document.getElementById('static_route6_table_container').firstChild;
	var staticRouteData = getTableDataArray(staticRouteTable, true, false);
	var routeIndex = 0;
	for(routeIndex=0; routeIndex < staticRouteData.length; routeIndex++)
	{
		var row = staticRouteData[routeIndex];
		var destParts = parseDest6(row[0]); //converts "default" properly
		var dest    = destParts[0];
		var netmask = destParts[1];
		var iface   = row[1];
		var gateway = (row[2] == "*") ? "::" : row[2];
		var routeId = "route" + (routeIndex+1+routeIdxOffset);
		uci.set("network", routeId, "", "route6");
		uci.set("network", routeId, "target", dest+"/"+netmask);
		uci.set("network", routeId, "interface", iface);
		uci.set("network", routeId, "gateway", gateway);
	}

	commands = removeCommands.join("\n") + "\n" + uci.getScriptCommands(uciOriginal)  +  "\nsh /usr/lib/gargoyle/restart_network.sh ;\n";
;
	var param = getParameterDefinition("commands", commands) + "&" + getParameterDefinition("hash", document.cookie.replace(/^.*hash=/,"").replace(/[\t ;]+.*$/, ""));
	var stateChangeFunction = function(req)
	{
		if(req.readyState == 4){}
	}
	runAjax("POST", "utility/run_commands.sh", param, stateChangeFunction);

	//test for router coming back up
	currentProtocol = location.href.match(/^https:/) ? "https" : "http";
	testLocation = currentProtocol + "://" + window.location.host + "/utility/reboot_test.sh";
	testReboot = function()
	{
		toggleReload = true;
		setTimeout( "testReboot()", 5*1000);  //try again after 12 seconds
		document.getElementById("reboot_test").src = testLocation;
	}
	setTimeout( "testReboot()", 15*1000);  //start testing after 15 seconds
	setTimeout( "reloadPage()", 240*1000); //after 4 minutes, try to reload anyway
}


function reloadPage()
{
	if(toggleReload)
	{
		//IE calls onload even when page isn't loaded -- it just times out and calls it anyway
		//We can test if it's loaded for real by looking at the (IE only) readyState property
		//For Browsers NOT designed by dysfunctional cretins whose mothers were a pack of sewer-dwelling, shit-eating rodents,
		//well, for THOSE browsers, readyState (and therefore reloadState) should be null
		var reloadState = document.getElementById("reboot_test").readyState;
		if( typeof(reloadState) == "undefined" || reloadState == null || reloadState == "complete")
		{
			toggleReload = false;
			document.getElementById("reboot_test").src = "";
			setTimeout( "window.location.href = window.location.href;", 1500);
		}
	}
}


function resetData()
{
	routingData.shift();
	routingData.shift();

	var activeRouteTableData = [];
	while(routingData.length > 0)
	{
		var str = routingData.shift();
		var rLine = str.split(/[\t ]+/);
		var r = [];
		var iface = rLine[7];
		iface= rLine[7] == wanIface ? iface+ " (WAN)" : iface;
		iface= rLine[7] == lanIface ? iface + " (LAN)" : iface;
		if(iface != "")
		{
			mask = (rLine[0] == "default" && rLine[2] == "0.0.0.0") ? "" : "/" + rLine[2];
			mask = mask == "/255.255.255.255" ? "" : mask;
			r.push(rLine[0] + mask, iface, rLine[1],  rLine[4]);
			activeRouteTableData.push(r);
		}
	}
	var tableContainer = document.getElementById("active_route_table_container");
	if(tableContainer.firstChild != null)
	{
		tableContainer.removeChild(tableContainer.firstChild);
	}
	var activeRouteTable = createTable([rtgS.Dstn, rtgS.ItfN, rtgS.Gtwy, rtgS.Mtrc], activeRouteTableData, "active_route_table", false, false);
	tableContainer.appendChild( activeRouteTable );

	routing6Data.shift();
	routing6Data.shift();
	var activeRoute6TableData = [];
	var defaultRouteFound = false;
	while(routing6Data.length > 0)
	{
		var str = routing6Data.shift();
		var rLine = str.split(/[\t ]+/);
		var r = [];
		var iface = rLine[6];
		iface= rLine[6] == wanIface ? iface+ " (WAN)" : iface;
		iface= rLine[6] == lanIface ? iface + " (LAN)" : iface;
		if(iface != "" && iface != "lo")
		{
			gateway = rLine[1] != "::" ? rLine[1] : "*";
			destination = rLine[0] == "::/0" ? "default" : rLine[0];
			if(!defaultRouteFound || destination != "default")
			{
				if(destination == "default")
				{
					defaultRouteFound = true;
				}
				r.push(destination, iface, gateway,  rLine[4]);
				activeRoute6TableData.push(r);
			}
		}
	}
	var tableContainer = document.getElementById("active_route6_table_container");
	if(tableContainer.firstChild != null)
	{
		tableContainer.removeChild(tableContainer.firstChild);
	}
	var activeRoute6Table = createTable([rtgS.Dstn, rtgS.ItfN, rtgS.Gtwy, rtgS.Mtrc], activeRoute6TableData, "active_route6_table", false, false);
	tableContainer.appendChild( activeRoute6Table );

	var routeSections = uciOriginal.getAllSectionsOfType("network", "route");
	var staticRouteTableData = [];
	while(routeSections.length > 0)
	{
		var section = routeSections.shift();
		var dest    = uciOriginal.get("network", section, "target");
		var mask    = uciOriginal.get("network", section, "netmask");
		var iface   = uciOriginal.get("network", section, "interface");
		var gateway = uciOriginal.get("network", section, "gateway");
		gateway = gateway == "0.0.0.0" ? "*" : gateway ;

		dest = mask == "" ? dest : dest + "/" + mask;
		dest = dest == "0.0.0.0" || dest == "0.0.0.0/0.0.0.0" ? "default" : dest
		staticRouteTableData.push( [ dest, iface, gateway, createEditButton("IPv4") ] );
	}

	tableContainer = document.getElementById("static_route_table_container");
	if(tableContainer.firstChild != null)
	{
		tableContainer.removeChild(tableContainer.firstChild);
	}
	var staticRouteTable = createTable([rtgS.Dstn, rtgS.Itfc, rtgS.Gtwy, ""], staticRouteTableData , "static_route_table", true, false);
	tableContainer.appendChild( staticRouteTable );

	var routeSections = uciOriginal.getAllSectionsOfType("network", "route6");
	var staticRouteTableData = [];
	while(routeSections.length > 0)
	{
		var section = routeSections.shift();
		var dest    = uciOriginal.get("network", section, "target");
		var iface   = uciOriginal.get("network", section, "interface");
		var gateway = uciOriginal.get("network", section, "gateway");
		gateway = gateway == "::" ? "*" : gateway;
		dest = dest == "::" || dest == "::/0" ? "default" : dest
		staticRouteTableData.push( [ dest, iface, gateway, createEditButton("IPv6") ] );
	}
	tableContainer = document.getElementById("static_route6_table_container");
	if(tableContainer.firstChild != null)
	{
		tableContainer.removeChild(tableContainer.firstChild);
	}
	var staticRouteTable = createTable([rtgS.Dstn, rtgS.Itfc, rtgS.Gtwy, ""], staticRouteTableData , "static_route6_table", true, false);
	tableContainer.appendChild( staticRouteTable );
}


function createEditButton(family)
{
	var editButton = createInput("button");
	editButton.textContent = UI.Edit;
	editButton.className = "btn btn-default btn-edit";
	editButton.onclick = family == "IPv6" ? editStatic6Modal : editStaticModal;
	return editButton;
}



function addStaticRoute()
{
	errors = proofreadStaticRoute("IPv4");
	if(errors.length > 0)
	{
		alert(errors.join("\n") + "\n\n"+rtgS.AErr);
	}
	else
	{
		var destData = parseDest(document.getElementById("add_dest").value);
		var dest = destData[1] == "" ? destData[0] : destData[0] + "/" + destData[1];
		var iface = getSelectedValue("add_iface");
		var gateway  = document.getElementById("add_gateway").value;
		gateway = gateway == "0.0.0.0" ? "*" : gateway;
		dest = dest == "0.0.0.0/0.0.0.0" ? "default" : dest;

		var row = [dest, iface, gateway, createEditButton("IPv4") ];
		var staticRouteTable = document.getElementById('static_route_table_container').firstChild;
		addTableRow(staticRouteTable,row, true, false);
		
		closeModalWindow('static_route_modal');
	}
}

function validateGatewayIp(ip)
{
	return (validateIP(ip) == 0 || ip == "0.0.0.0" || ip == "*") ? 0 : 1 ;
}
function proofreadGatewayIp(input)
{
	proofreadText(input, validateGatewayIp, 0);
}
function validateRouteIp(ip)
{
	return (validateIpRange(ip) == 0 || ip == "0.0.0.0" || ip == "0.0.0.0/0.0.0.0" || ip == "0.0.0.0/0" || ip == "default") ? 0 : 1 ;
}
function proofreadRouteIp(input)
{
	proofreadText(input, validateRouteIp, 0);
}
function validateGatewayIp6(ip)
{
	return (validateIP6(ip) == 0 || ip == "::" || ip == "*") ? 0 : 1 ;
}
function proofreadGatewayIp6(input)
{
	proofreadText(input, validateGatewayIp6, 0);
}
function validateRouteIp6(ip)
{
	return (validateIP6Range(ip) == 0 || ip == "::" || ip == "::/0" || ip == "default") ? 0 : 1 ;
}
function proofreadRouteIp6(input)
{
	proofreadText(input, validateRouteIp6, 0);
}

function proofreadStaticRoute(family)
{
	if(family == "IPv4")
	{
		addIds=['add_dest', 'add_gateway'];
		labelIds= ['add_dest_label', 'add_gateway_label'];
		functions = [validateRouteIp, validateGatewayIp];
		returnCodes = [0,0];
	}
	else
	{
		addIds=['add_dest6', 'add_gateway6'];
		labelIds= ['add_dest6_label', 'add_gateway6_label'];
		functions = [validateRouteIp6, validateGatewayIp6];
		returnCodes = [0,0];
	}
	visibilityIds=addIds;
	return proofreadFields(addIds, labelIds, functions, returnCodes, visibilityIds, document);
}

function parseDest(origDest)
{
	var dest = origDest;
	if( dest.toLowerCase() == "default" || dest == "0.0.0.0" ||dest == "0.0.0.0/0" || dest == "0.0.0.0/0.0.0.0")
	{
		dest = "0.0.0.0/0.0.0.0"
	}
	var mask = "";
	if(dest.match(/\//))
	{
		var splitDest = dest.split(/\//);
		dest = splitDest[0];
		mask = splitDest[1];
		if(!mask.match(/\./))
		{
			//convert to full numeric format
			var bits = parseInt(mask);
			var maskParts = [];
			while(maskParts.length < 4)
			{
				var nextBits = bits > 8 ? 8 : bits;
				var nextVal = 255;
				var bitCount = nextBits;
				while(bitCount < 8)
				{
					var nextPow = 7-bitCount;
					nextVal = nextVal - Math.pow(2, nextPow);
					bitCount++;
				}
				bits = bits- nextBits;
				maskParts.push("" + nextVal);
			}
			mask = maskParts.join(".");
		}

		//for some really stupid reason busybox route command requires that everything after mask is 0 in dest ip
		splitDest = dest.split(/\./);
		splitMask = mask.split(/\./);
		var byteIndex=3;
		while(byteIndex > 0)
		{
			splitDest[byteIndex] = "" + (parseInt(splitDest[byteIndex]) & parseInt(splitMask[byteIndex]));
			byteIndex--;
		}
		dest = splitDest.join(".");
		mask = splitMask.join(".");
	}
	return [ dest, mask ];
}

function parseDest6(origDest)
{
	var dest = ip6_canonical(origDest);
	if( origDest.toLowerCase() == "default" || dest == "::" ||dest == "::/0")
	{
		dest = "::/0"
	}
	var mask = "";
	if(dest.match(/\//))
	{
		var splitDest = dest.split(/\//);
		dest = splitDest[0];
		mask = splitDest[1];
	}
	else
	{
		//Assume they have entered a single IP and we should give them /128
		mask = "128";
	}
	return [ dest, mask ];
}

function editStaticRoute(editRow)
{
	// error checking goes here
	var errors = proofreadStaticRoute("IPv4");
	if(errors.length > 0)
	{
		alert(errors.join("\n") + "\n"+rtgS.SRErr);
	}
	else
	{
		//update document with new data
		var newGw = document.getElementById("add_gateway").value;
		newGw = newGw == "0.0.0.0" ? "*" : newGw;
		var adjDst = parseDest( document.getElementById("add_dest").value );
		var newDst = adjDst[1] == "" ? adjDst[0] : adjDst[0] + "/" + adjDst[1];
		newDst = newDst == "0.0.0.0/0.0.0.0" ? "default" : newDst;
		editRow.childNodes[0].firstChild.data = newDst;
		editRow.childNodes[1].firstChild.data = getSelectedValue("add_iface", document);
		editRow.childNodes[2].firstChild.data = newGw;
		closeModalWindow('static_route_modal');
	}
}

function addStaticModal()
{
	modalButtons = [
		{"title" : UI.Add, "classes" : "btn btn-primary", "function" : addStaticRoute},
		"defaultDismiss"
	];

	var dest = "";
	var iface = "wan";
	var gateway = "";

	modalElements = [
		{"id" : "add_dest", "value" : dest},
		{"id" : "add_iface", "value" : iface},
		{"id" : "add_gateway", "value" : gateway}
	];
	modalPrepare('static_route_modal', rtgS.ASRte, modalElements, modalButtons);
	openModalWindow('static_route_modal');
}

function editStaticModal()
{
	editRow=this.parentNode.parentNode;
	modalButtons = [
		{"title" : UI.CApplyChanges, "classes" : "btn btn-primary", "function" : function(){editStaticRoute(editRow);}},
		"defaultDiscard"
	];

	dest = editRow.childNodes[0].firstChild.data;
	dest = dest == "default" ? "0.0.0.0/0.0.0.0" : dest;
	iface = editRow.childNodes[1].firstChild.data;
	gateway = editRow.childNodes[2].firstChild.data;
	gateway = gateway == "*" ? "0.0.0.0" : gateway;

	modalElements = [
		{"id" : "add_dest", "value" : dest},
		{"id" : "add_iface", "value" : iface},
		{"id" : "add_gateway", "value" : gateway}
	];
	modalPrepare('static_route_modal', rtgS.ESSect, modalElements, modalButtons);
	openModalWindow('static_route_modal');
}

	function addStatic6Modal()
{
	modalButtons = [
		{"title" : UI.Add, "classes" : "btn btn-primary", "function" : addStatic6Route},
		"defaultDismiss"
	];
	var dest = "";
	var iface = "wan";
	var gateway = "";
	modalElements = [
		{"id" : "add_dest6", "value" : dest},
		{"id" : "add_iface6", "value" : iface},
		{"id" : "add_gateway6", "value" : gateway}
	];
	modalPrepare('static_route6_modal', rtgS.ASRte, modalElements, modalButtons);
	openModalWindow('static_route6_modal');
}
function addStatic6Route()
{
	errors = proofreadStaticRoute("IPv6");
	if(errors.length > 0)
	{
		alert(errors.join("\n") + "\n\n"+rtgS.AErr);
	}
	else
	{
		var destData = parseDest6(document.getElementById("add_dest6").value);
		var dest = destData[1] == "" ? destData[0] : destData[0] + "/" + destData[1];
		var iface = getSelectedValue("add_iface6");
		var origgateway  = document.getElementById("add_gateway6").value;
		var gateway = ip6_canonical(origgateway);
		if(origgateway == "*")
		{
			gateway = "*";
		}
		gateway = gateway == "::" ? "*" : gateway;
		dest = dest == "::/0" ? "default" : dest;
		var row = [dest, iface, gateway, createEditButton("IPv6") ];
		var staticRouteTable = document.getElementById('static_route6_table_container').firstChild;
		addTableRow(staticRouteTable,row, true, false);
		
		closeModalWindow('static_route6_modal');
	}
}
function editStatic6Modal()
{
	editRow=this.parentNode.parentNode;
	modalButtons = [
		{"title" : UI.CApplyChanges, "classes" : "btn btn-primary", "function" : function(){editStatic6Route(editRow);}},
		"defaultDiscard"
	];
	dest = editRow.childNodes[0].firstChild.data;
	dest = dest == "default" ? "::/0" : dest;
	iface = editRow.childNodes[1].firstChild.data;
	gateway = editRow.childNodes[2].firstChild.data;
	gateway = gateway == "*" ? "::" : gateway;
	modalElements = [
		{"id" : "add_dest", "value" : dest},
		{"id" : "add_iface", "value" : iface},
		{"id" : "add_gateway", "value" : gateway}
	];
	modalPrepare('static_route6_modal', rtgS.ESSect, modalElements, modalButtons);
	openModalWindow('static_route6_modal');
}
function editStatic6Route(editRow)
{
	// error checking goes here
	var errors = proofreadStaticRoute("IPv6");
	if(errors.length > 0)
	{
		alert(errors.join("\n") + "\n"+rtgS.SRErr);
	}
	else
	{
		//update document with new data
		var newGw = document.getElementById("add_gateway6").value;
		newGw = newGw == "::" ? "*" : newGw;
		var adjDst = parseDest6( document.getElementById("add_dest6").value );
		var newDst = adjDst[1] == "" ? adjDst[0] : adjDst[0] + "/" + adjDst[1];
		newDst = newDst == "::/0" ? "default" : newDst;
		editRow.childNodes[0].firstChild.data = newDst;
		editRow.childNodes[1].firstChild.data = getSelectedValue("add_iface6", document);
		editRow.childNodes[2].firstChild.data = newGw;
		closeModalWindow('static_route6_modal');
	}
}