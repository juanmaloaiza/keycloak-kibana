import React from 'react';
import PropTypes from 'prop-types';
import _ from 'lodash';
import { toastNotifications } from 'ui/notify';
import {
  EuiBasicTable,
  EuiButton,
  EuiButtonIcon,
  EuiComboBox,
  EuiHighlight,
  EuiIcon,
  EuiLink,
  EuiModalBody,
  EuiModalFooter,
  EuiModalHeader,
  EuiModalHeaderTitle,
  EuiOverlayMask,
  EuiPanel,
  EuiSpacer,
  EuiText,
} from '@elastic/eui';
import Permissions from '../constants/Permissions';
import PermissionSelectBox from './PermissionSelectBox';

const ANYONE = { label: 'Anyone', value: '' };

export default class ShareDashboardModal extends React.Component {

  constructor(props) {
    super(props);
    this.state = {
      availablePermissions: Permissions.listAvailable(),
      availableUsers: [],
      selectedUsers: [],
      isFetchingUsers: false,
      isFetchingPermissions: false,
      advancedView: false,
      userFilter: null,
      permissions: { all: [], users: [] }
    };
    this.state.selectedPermission = this.state.availablePermissions[0];
  }

  debouncedFetchUsers = _.debounce(async (filter) => {
    const response = await this.props.getUsers(filter);
    const availableUsers = response.map(u => {
      return { label: `${u.name || u.id}`, value: u.id, userData: u };
    });
    this.setState({ isFetchingUsers: false, availableUsers: [ANYONE].concat(availableUsers) });
  }, 300);

  fetchUsers = (userFilter) => {
    this.setState({
      isFetchingUsers: true,
      userFilter
    }, this.debouncedFetchUsers.bind(null, userFilter));
  };

  debouncedFetchPermissions = _.debounce(async (dashboardId) => {
    const permissions = await this.props.getPermissions(dashboardId);
    this.setState({ isFetchingPermissions: false, permissions });
  }, 500);

  fetchPermissions = (dashboardId) => {
    this.setState({
      isFetchingPermissions: true,
    }, this.debouncedFetchPermissions.bind(null, dashboardId));
  };

  componentDidMount() {
    this.fetchUsers();
  }

  setSelectedUsers = (selectedUsers) => {
    this.setState({ selectedUsers });
  };

  setSelectedPermission = (selectedPermission) => {
    this.setState({ selectedPermission });
  };

  shareDashboard = () => {
    const dashboardId = this.props.dashboard.id;
    const permission = this.state.selectedPermission.value;
    const userIds = this.state.selectedUsers.map(u => u.value);

    const hasPermissionForAnyone = _.some(this.state.selectedUsers,
      user => user.value === ANYONE.value);

    const shareTask = hasPermissionForAnyone
      ? this.props.addPermissionForAll(dashboardId, permission)
      : this.props.addPermission(dashboardId, permission, userIds);

    shareTask.then(() => {
      if (this.state.advancedView) {
        this.setState({ selectedUsers: [] });
        this.fetchPermissions(this.props.dashboard.id);
      } else {
        const peopleAmount = hasPermissionForAnyone ? 'everybody' : `${userIds.length} person(s).`;
        toastNotifications.addSuccess(`Dashboard shared successfully with ${peopleAmount}.`);
        this.props.onClose();
      }
    }).catch((error) => {
      console.warn(error);
      toastNotifications.addDanger({
        title: `Unable to assign new permissions for the dashboard`,
        text: `${error.statusText}`,
      });
    });
  };

  revokePermissions = (user) => {
    const tasks = user.permissions.map(permission => {
      return user.id
        ? this.props.revokePermission(this.props.dashboard.id, permission, user.id)
        : this.props.revokePermissionForAll(this.props.dashboard.id, permission);
    });
    Promise.all(tasks).then(() => {
      this.fetchPermissions(this.props.dashboard.id);
    }).catch((error) => {
      console.warn(error);
      toastNotifications.addDanger({
        title: `Unable to revoke permissions for the dashboard`,
        text: `${error.statusText}`,
      });
    });
  };

  renderUserItem = (option, searchValue, OPTION_CONTENT_CLASSNAME) => {
    return (
      <div>
        <EuiHighlight search={searchValue} className={OPTION_CONTENT_CLASSNAME}>{option.label}</EuiHighlight>&nbsp;
        {option.userData && option.userData.email &&
        <span style={{ fontSize: '0.8em', color: '#999' }}>
                    | <EuiHighlight search={searchValue} className={OPTION_CONTENT_CLASSNAME}>{option.userData.email}</EuiHighlight>
        </span>}
      </div>
    );
  };

  clearSelectedUsers = () => {
    this.setState({
      selectedUsers: []
    });
  };

  toggleAdvancedView = () => {
    this.fetchPermissions(this.props.dashboard.id);
    this.setState({ advancedView: true });
  };

  renderUserName = (user) => (
    <span>{user.name || user.id || 'Anyone'}<span style={{ color: '#aaa' }}>{user.you ? ' (you)' : ''}</span><br/></span>
  );

  renderUserIcon = (user) => (
    <span style={{ background: '#eeeeee', padding: '5px', marginRight: '5px' }}>
      <EuiIcon size="m" type={user.id ? 'user' : 'asterisk'}/>
    </span>
  );

  renderPermissionList = () => {
    const { users, all } = this.state.permissions;
    let actualUsers = users;
    if (all.length > 0) {
      actualUsers = [{ permissions: all }].concat(users);
    }

    const columns = [
      {
        field: 'name',
        name: 'Who has access',
        width: '200px',
        render: (field, user) => (
          <div>
            <EuiText style={{ fontSize: '0.9em' }}>
              {this.renderUserIcon(user)}
              {this.renderUserName(user)}
            </EuiText>
          </div>
        )
      },
      {
        field: 'permissions',
        render: (field, user) => (
          <EuiText style={{ fontSize: '0.9em' }}>{user.owner ? 'is owner' : 'can ' + user.permissions.join(', ')}</EuiText>
        )
      },
      {
        actions: [{
          render: (user) => (user.owner ? <span/> : <EuiButtonIcon
            iconType="trash"
            color="text"
            aria-label="Remove"
            onClick={() => this.revokePermissions(user)}
          />)
        }]
      }
    ];
    return (
      <EuiBasicTable
        style={{ width: '400px' }}
        itemId={'id'}
        items={actualUsers}
        loading={this.state.isFetchingPermissions}
        columns={columns}
        noItemsMessage={this.state.isFetchingPermissions
          ? 'Loading permissions...'
          : 'The dashboard has not been shared with anyone so far.'}
      />
    );
  };

  render() {
    return (
      <EuiOverlayMask>
        <EuiPanel style={{ flexGrow: 0.05 }}>
          <EuiModalHeader>
            <EuiModalHeaderTitle>
              Sharing options
            </EuiModalHeaderTitle>
          </EuiModalHeader>
          <EuiModalBody>
            {this.state.advancedView && this.renderPermissionList()}
            <EuiSpacer/>
            <EuiText>
              <p>Please select people you want the dashboard to be shared with.</p>
            </EuiText>
            <EuiSpacer/>
            <EuiComboBox
              options={this.state.availableUsers}
              selectedOptions={this.state.selectedUsers}
              onSearchChange={this.fetchUsers}
              onChange={this.setSelectedUsers}
              renderOption={this.renderUserItem}
              placeholder="Enter user names or emails..."
              singleSelection={false}
              style={{ float: 'left' }}
            />

            <PermissionSelectBox
              options={this.state.availablePermissions}
              selectedOption={this.state.selectedPermission}
              onChange={this.setSelectedPermission}
            />
          </EuiModalBody>

          <EuiModalFooter>
            {!this.state.advancedView &&
            <EuiLink style={{ marginRight: 'auto' }} onClick={this.toggleAdvancedView}>Advanced</EuiLink>}
            {this.state.selectedUsers.length > 0
              ? [
                <EuiButton data-test-subj="shareCancelButton" onClick={this.clearSelectedUsers}>Cancel</EuiButton>,
                <EuiButton fill data-test-subj="shareConfirmButton" onClick={this.shareDashboard}>Share</EuiButton>
              ] : [
                <EuiButton fill data-test-subj="shareDoneButton" onClick={this.props.onClose}>Done</EuiButton>
              ]}
          </EuiModalFooter>
        </EuiPanel>
      </EuiOverlayMask>
    );
  }
}

ShareDashboardModal.propTypes = {
  dashboard: PropTypes.object.isRequired,
  onClose: PropTypes.func.isRequired,
  getUsers: PropTypes.func.isRequired,
  getPermissions: PropTypes.func.isRequired,
  addPermission: PropTypes.func.isRequired,
  addPermissionForAll: PropTypes.func.isRequired,
  revokePermission: PropTypes.func.isRequired,
  revokePermissionForAll: PropTypes.func.isRequired,
};