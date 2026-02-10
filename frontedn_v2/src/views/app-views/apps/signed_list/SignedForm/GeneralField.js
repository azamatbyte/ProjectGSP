import React, { useEffect } from "react";
import { Input, Row, Col, Card, Form, Select, DatePicker } from "antd";
import { DATE_FORMAT_DD_MM_YYYY_WITH_DOT, DATE_FORMAT_DD_MM_YYYY_COMBINED } from "constants/DateConstant";
import SignedListService from "services/SignedListService";
import { useTranslation } from "react-i18next";
import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";
dayjs.extend(customParseFormat);
const { Option } = Select;

const GeneralField = (props) => {
	const { form, id, mode } = props;
	const { t } = useTranslation();


	useEffect(() => {
		if (mode === "EDIT") {
			SignedListService.getById(id).then((res) => {
				form.setFieldsValue(res.data);
			});
		}
	}, [mode, id, form]);


	const handleChange = (value, key) => {
		if (key === "role") {
			form.setFieldsValue({ role: value === "admin" ? "admin" : "superAdmin" });
		} else if (key === "gender") {
			form.setFieldsValue({ gender: value === "male" ? "male" : "female" });
		}
	};

	const handleBirthDateKeyDown = (event) => {
		if (event.key === "Enter") {
			event.preventDefault();
			event.stopPropagation();
			const inputValue = (event.target?.value || "").replace(/\D/g, "");
			if (inputValue.length === 8) {
				const parsed = dayjs.utc(inputValue, DATE_FORMAT_DD_MM_YYYY_COMBINED, true);
				if (parsed.isValid()) {
					form.setFieldsValue({ birthDate: parsed });
				}
			}

			// Move focus to the next tabbable element in the same form
			const active = document.activeElement;
			const formEl = active && active.closest ? active.closest("form") : null;
			if (formEl) {
				const tabbables = Array.from(formEl.querySelectorAll("[tabindex]"))
					.filter((el) => el.tabIndex >= 0 && !el.hasAttribute("disabled"))
					.sort((a, b) => a.tabIndex - b.tabIndex);
				const currentTab = active && typeof active.tabIndex === "number" ? active.tabIndex : -1;
				const next = tabbables.find((el) => el.tabIndex > currentTab) || tabbables[0];
				if (next && typeof next.focus === "function") {
					next.focus();
				}
			}
		}
	};

	return (
		<>
			<Row gutter={16}>
				<Col xs={24} sm={24} md={17}>
					<Card title={t("basic_info")}>
						<Row gutter={16}>
							<Col xs={24} sm={24} md={8}>
								<Form.Item name="lastName" label={t("last_name")}>
									<Input className="w-100" autoFocus tabIndex={1} maxLength={255} onKeyDown={(e) => {
										if (e.key === "Enter") {
											e.preventDefault();
											const nextInput = document.querySelector("[tabindex=\"1\"]");
											if (nextInput) nextInput.focus();
										}
									}}/>
								</Form.Item>
							</Col>
							<Col xs={24} sm={24} md={8}>
								<Form.Item name="firstName" label={t("first_name")}>
									<Input className="w-100" maxLength={255} tabIndex={2} onKeyDown={(e) => {
										if (e.key === "Enter") {
											e.preventDefault();
											const nextInput = document.querySelector("[tabindex=\"2\"]");
											if (nextInput) nextInput.focus();
										}
									}}/>
								</Form.Item>
							</Col>
							<Col xs={24} sm={24} md={8}>
								<Form.Item name="fatherName" label={t("father_name")}>
									<Input className="w-100" tabIndex={3} maxLength={255} onKeyDown={(e) => {
										if (e.key === "Enter") {
											e.preventDefault();
											const nextInput = document.querySelector("[tabindex=\"3\"]");
											if (nextInput) nextInput.focus();
										}
									}}/>
								</Form.Item>
							</Col>
							<Col xs={24} sm={24} md={12}>
								<Form.Item name="workplace" label={t("workplace")}>
									<Input className="w-100" tabIndex={4} maxLength={255} onKeyDown={(e) => {
										if (e.key === "Enter") {
											e.preventDefault();
											const nextInput = document.querySelector("[tabindex=\"4\"]");
											if (nextInput) nextInput.focus();
										}
									}}/>
								</Form.Item>
							</Col>
							<Col xs={24} sm={24} md={12}>
								<Form.Item name="position" label={t("position")}>
									<Input className="w-100" tabIndex={5} maxLength={255} onKeyDown={(e) => {
										if (e.key === "Enter") {
											e.preventDefault();
											const nextInput = document.querySelector("[tabindex=\"5\"]");
											if (nextInput) nextInput.focus();
										}
									}}/>
								</Form.Item>
							</Col>
							<Col xs={24} sm={24} md={12}>
								<Form.Item name="rank" label={t("rank")}>
									<Input className="w-100" tabIndex={5} maxLength={255} onKeyDown={(e) => {
										if (e.key === "Enter") {
											e.preventDefault();
											const nextInput = document.querySelector("[tabindex=\"5\"]");
											if (nextInput) nextInput.focus();
										}
									}}/>
								</Form.Item>
							</Col>
							<Col xs={24} sm={24} md={12}>
								<Form.Item name="notes" label={t("note")}>
									<Input className="w-100" tabIndex={6} maxLength={255} onKeyDown={(e) => {
										if (e.key === "Enter") {
											e.preventDefault();
											const nextInput = document.querySelector("[tabindex=\"6\"]");
											if (nextInput) nextInput.focus();
										}
									}}/>
								</Form.Item>
							</Col>
							<Col xs={24} sm={24} md={12}>
								<Form.Item name="birthDate" label={t("birth_date")}>
									<DatePicker
										format={DATE_FORMAT_DD_MM_YYYY_WITH_DOT}
										className="w-100"
										tabIndex={7}
										onKeyDown={handleBirthDateKeyDown}
									/>
								</Form.Item>
							</Col>
							{/* <Col xs={24} sm={24} md={12}>
								<Form.Item name="nationality" label={t("nationality")}>
									<Input className="w-100" tabIndex={8} maxLength={255} />
								</Form.Item>      
							</Col> */}
							<Col xs={24} sm={24} md={12}>
								<Form.Item name="gender" label={t("gender")} initialValue="male">
									<Select
										placeholder={t("select_gender")}
										className="w-100"
										onChange={(value) => handleChange(value, "gender")}
										tabIndex={9}
										onKeyDown={(e) => {
											if (e.key === "Enter") {
											  e.preventDefault();
											  const nextInput = document.querySelector("[tabindex=\"10\"]");
											  if (nextInput) nextInput.focus();
											}
										  }}
									>
										<Option value="male">{t("male")}</Option>
										<Option value="female">{t("female")}</Option>
									</Select>
								</Form.Item>
							</Col>
						</Row>
					</Card>
				</Col>
			</Row>
		</>
	);
};

export default GeneralField;
